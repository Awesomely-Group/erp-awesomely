/**
 * Asigna métodos de pago en Holded según clasificación ERP:
 *   - Partner   → Transferencia bancaria
 *   - Proveedor → Domiciliación bancaria
 *
 * Modo DRY_RUN=true: solo lista cambios, no modifica nada.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const DRY_RUN = process.env.DRY_RUN !== "false";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const HOLDED_BASE = "https://api.holded.com/api/v2";

function holdedAuthHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}` };
}

async function holdedFetch<T>(apiKey: string, path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${HOLDED_BASE}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { headers: holdedAuthHeaders(apiKey) });
  if (!res.ok) throw new Error(`Holded GET ${res.status} ${path}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function holdedPut<T>(apiKey: string, path: string, body: unknown): Promise<T> {
  const url = `${HOLDED_BASE}${path}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { ...holdedAuthHeaders(apiKey), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Holded PUT ${res.status} ${path}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

type HoldedContact = {
  id: string;
  name: string;
  type?: string;
  email?: string;
  defaults?: { paymentMethod?: string | number };
};

async function getAllContacts(apiKey: string): Promise<HoldedContact[]> {
  const PAGE_SIZE = 500;
  const all = new Map<string, HoldedContact>();
  let offset = 0;
  while (true) {
    const batch = await holdedFetch<HoldedContact[]>(apiKey, "/contacts", {
      limit: String(PAGE_SIZE), offset: String(offset),
    });
    if (batch.length === 0) break;
    for (const c of batch) if (!all.has(c.id)) all.set(c.id, c);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return [...all.values()];
}

async function main(): Promise<void> {
  console.log(`Modo: ${DRY_RUN ? "DRY RUN (sin cambios)" : "⚠️  APLICANDO CAMBIOS REALES"}\n`);

  const company = await prisma.company.findFirst({
    where: { name: { contains: "SL" } },
    select: { id: true, name: true, holdedApiKey: true },
  });
  if (!company) throw new Error("No se encontró Awesomely SL");
  console.log(`Empresa: ${company.name}`);

  // Métodos de pago
  const paymentMethods = await holdedFetch<Array<{ id: string; name: string }>>(
    company.holdedApiKey, "/payment-methods"
  );
  const pmNameMap = new Map(paymentMethods.map((p) => [p.id, p.name]));
  const pmIdMap   = new Map(paymentMethods.map((p) => [p.name, p.id]));

  const PM_TRANSFER     = pmIdMap.get("Transferencia bancaria")!;
  const PM_DOMICILIACION = pmIdMap.get("Domiciliación bancaria")!;

  if (!PM_TRANSFER || !PM_DOMICILIACION) {
    throw new Error("No se encontraron los IDs de los métodos de pago necesarios");
  }
  console.log(`  Transferencia bancaria  → ${PM_TRANSFER}`);
  console.log(`  Domiciliación bancaria  → ${PM_DOMICILIACION}\n`);

  // Contactos Holded + suppliers ERP
  const contacts = await getAllContacts(company.holdedApiKey);
  const erpSuppliers = await prisma.supplier.findMany({
    where: { companyId: company.id },
    select: { holdedContactId: true, name: true, isPartner: true, active: true },
  });
  const erpMap = new Map(erpSuppliers.map((s) => [s.holdedContactId, s]));

  // Determinar cambios necesarios
  type Change = {
    holdedId: string;
    name: string;
    currentPm: string;
    targetPm: string;
    targetPmId: string;
    rol: "Partner" | "Proveedor";
  };

  const changes: Change[] = [];
  const alreadyOk: { name: string; rol: string; pm: string }[] = [];

  for (const c of contacts) {
    const erp = erpMap.get(c.id);
    if (!erp) continue; // no está en ERP → ignorar

    const currentPmId = typeof c.defaults?.paymentMethod === "string" && c.defaults.paymentMethod !== "0"
      ? c.defaults.paymentMethod
      : undefined;
    const currentPmName = currentPmId ? (pmNameMap.get(currentPmId) ?? `ID:${currentPmId}`) : "Sin método";

    const rol: "Partner" | "Proveedor" = erp.isPartner ? "Partner" : "Proveedor";
    const targetPmId   = erp.isPartner ? PM_TRANSFER : PM_DOMICILIACION;
    const targetPmName = erp.isPartner ? "Transferencia bancaria" : "Domiciliación bancaria";

    if (currentPmId === targetPmId) {
      alreadyOk.push({ name: c.name, rol, pm: currentPmName });
    } else {
      changes.push({
        holdedId: c.id,
        name: c.name,
        currentPm: currentPmName,
        targetPm: targetPmName,
        targetPmId,
        rol,
      });
    }
  }

  // Mostrar resumen
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
        console.log(`  · ${ch.name.padEnd(45)} (actual: ${ch.currentPm})`);
      }
    }
  }

  if (DRY_RUN) {
    console.log("\n──────────────────────────────────────────────");
    console.log("DRY RUN completado. Para aplicar: DRY_RUN=false npx tsx scripts/fix-contact-payment-methods.ts");
    await prisma.$disconnect();
    return;
  }

  // Aplicar cambios
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
    // Pequeña pausa para no saturar la API
    await new Promise((r) => setTimeout(r, 120));
  }

  console.log(`\n✓ Aplicados: ${ok} | ✗ Errores: ${errors}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
