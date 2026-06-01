/**
 * Asigna métodos de pago en Holded para Awesomely OU:
 *   - Partner   → Bank transfer
 *   - Proveedor → Direct Debit
 *
 * Modo DRY_RUN=true: solo lista cambios, no modifica nada.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const DRY_RUN = process.env.DRY_RUN !== "false";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const HOLDED_BASE = "https://api.holded.com/api/invoicing/v1";

async function holdedFetch<T>(apiKey: string, path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${HOLDED_BASE}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { headers: { key: apiKey } });
  if (!res.ok) throw new Error(`Holded GET ${res.status} ${path}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function holdedPut<T>(apiKey: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${HOLDED_BASE}${path}`, {
    method: "PUT",
    headers: { key: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Holded PUT ${res.status} ${path}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

type HoldedContact = {
  id: string;
  name: string;
  type?: string;
  defaults?: { paymentMethod?: string | number };
};

async function getAllContacts(apiKey: string): Promise<HoldedContact[]> {
  const all = new Map<string, HoldedContact>();
  let prevFirstId: string | undefined;
  for (let page = 1; page <= 20; page++) {
    const batch = await holdedFetch<HoldedContact[]>(apiKey, "/contacts", {
      page: String(page), limit: "500",
    });
    if (batch.length === 0) break;
    const firstId = batch[0]?.id;
    if (page > 1 && firstId && firstId === prevFirstId) break;
    prevFirstId = firstId;
    for (const c of batch) if (!all.has(c.id)) all.set(c.id, c);
    if (batch.length < 500) break;
  }
  return [...all.values()];
}

async function main(): Promise<void> {
  console.log(`Modo: ${DRY_RUN ? "DRY RUN (sin cambios)" : "⚠️  APLICANDO CAMBIOS REALES"}\n`);

  const company = await prisma.company.findFirst({
    where: { name: { contains: "OU" } },
    select: { id: true, name: true, holdedApiKey: true },
  });
  if (!company) throw new Error("No se encontró Awesomely OU");
  console.log(`Empresa: ${company.name}`);

  const paymentMethods = await holdedFetch<Array<{ id: string; name: string }>>(
    company.holdedApiKey, "/paymentmethods"
  );
  const pmNameMap = new Map(paymentMethods.map((p) => [p.id, p.name]));
  const pmIdMap   = new Map(paymentMethods.map((p) => [p.name, p.id]));

  console.log("\nMétodos de pago disponibles en OU:");
  for (const pm of paymentMethods) console.log(`  [${pm.id}] ${pm.name}`);

  const PM_TRANSFER    = pmIdMap.get("Bank transfer");
  const PM_DIRECT_DEBIT = pmIdMap.get("Direct Debit");

  if (!PM_TRANSFER)    throw new Error('No se encontró el método "Bank transfer"');
  if (!PM_DIRECT_DEBIT) throw new Error('No se encontró el método "Direct Debit"');

  console.log(`\n  Partner   → Bank transfer  (${PM_TRANSFER})`);
  console.log(`  Proveedor → Direct Debit   (${PM_DIRECT_DEBIT})\n`);

  const contacts = await getAllContacts(company.holdedApiKey);
  const erpSuppliers = await prisma.supplier.findMany({
    where: { companyId: company.id },
    select: { holdedContactId: true, name: true, isPartner: true },
  });
  const erpMap = new Map(erpSuppliers.map((s) => [s.holdedContactId, s]));

  type Change = {
    holdedId: string;
    name: string;
    currentPm: string;
    targetPm: string;
    targetPmId: string;
    rol: "Partner" | "Proveedor";
  };

  const changes: Change[] = [];
  const alreadyOk: string[] = [];

  for (const c of contacts) {
    const erp = erpMap.get(c.id);
    if (!erp) continue;

    const currentPmId = typeof c.defaults?.paymentMethod === "string" && c.defaults.paymentMethod !== "0"
      ? c.defaults.paymentMethod : undefined;
    const currentPmName = currentPmId ? (pmNameMap.get(currentPmId) ?? `ID:${currentPmId}`) : "Sin método";

    const rol: "Partner" | "Proveedor" = erp.isPartner ? "Partner" : "Proveedor";
    const targetPmId   = erp.isPartner ? PM_TRANSFER : PM_DIRECT_DEBIT;
    const targetPmName = erp.isPartner ? "Bank transfer" : "Direct Debit";

    if (currentPmId === targetPmId) {
      alreadyOk.push(c.name);
    } else {
      changes.push({ holdedId: c.id, name: c.name, currentPm: currentPmName, targetPm: targetPmName, targetPmId, rol });
    }
  }

  console.log(`Contactos ya correctos: ${alreadyOk.length}`);
  console.log(`Contactos a modificar:  ${changes.length}\n`);

  if (changes.length > 0) {
    console.log("=== Cambios pendientes ===");
    const byRol = new Map<string, Change[]>();
    for (const ch of changes) {
      const bucket = byRol.get(ch.rol) ?? [];
      bucket.push(ch);
      byRol.set(ch.rol, bucket);
    }
    for (const [rol, list] of byRol) {
      console.log(`\n[${rol}] → "${list[0].targetPm}" (${list.length} contactos)`);
      for (const ch of list) {
        console.log(`  · ${ch.name.padEnd(50)} (actual: ${ch.currentPm})`);
      }
    }
  }

  if (DRY_RUN) {
    console.log("\n──────────────────────────────────────────────");
    console.log("DRY RUN completado. Para aplicar: DRY_RUN=false npx tsx scripts/fix-contact-payment-methods-ou.ts");
    await prisma.$disconnect();
    return;
  }

  console.log("\n=== Aplicando cambios ===");
  let ok = 0;
  let errors = 0;

  for (const ch of changes) {
    try {
      await holdedPut(company.holdedApiKey, `/contacts/${ch.holdedId}`, {
        defaults: { paymentMethod: ch.targetPmId },
      });
      console.log(`  ✓ ${ch.name}`);
      ok++;
    } catch (e) {
      console.log(`  ✗ ${ch.name}: ${e instanceof Error ? e.message : String(e)}`);
      errors++;
    }
    await new Promise((r) => setTimeout(r, 120));
  }

  console.log(`\n✓ Aplicados: ${ok} | ✗ Errores: ${errors}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
