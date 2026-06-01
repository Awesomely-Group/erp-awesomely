/**
 * Sincroniza isPartner en el ERP según el método de pago en Holded:
 *   - Transferencia bancaria / Transferencia bancaria 75%/25% / Bank transfer → isPartner = true
 *   - Cualquier otro método (Domiciliación bancaria, Direct Debit, Pago al contado…) → isPartner = false
 *
 * DRY_RUN=true (por defecto): solo muestra cambios.
 * DRY_RUN=false: aplica los cambios en la base de datos del ERP.
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
  if (!res.ok) throw new Error(`Holded ${res.status} ${path}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

type HoldedContact = {
  id: string;
  name: string;
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

// Nombres de métodos de pago que implican Partner (en cualquier empresa/idioma)
const PARTNER_PM_NAMES = new Set([
  "Transferencia bancaria",
  "Transferencia bancaria 75%/25%",
  "Bank transfer",
]);

async function processCompany(company: { id: string; name: string; holdedApiKey: string }): Promise<void> {
  console.log(`\n${"═".repeat(60)}\n  ${company.name}\n${"═".repeat(60)}`);

  const [paymentMethods, contacts, erpSuppliers] = await Promise.all([
    holdedFetch<Array<{ id: string; name: string }>>(company.holdedApiKey, "/paymentmethods"),
    getAllContacts(company.holdedApiKey),
    prisma.supplier.findMany({
      where: { companyId: company.id },
      select: { id: true, holdedContactId: true, name: true, isPartner: true },
    }),
  ]);

  const pmNameMap = new Map(paymentMethods.map((p) => [p.id, p.name]));
  const contactMap = new Map(contacts.map((c) => [c.id, c]));

  type Change = {
    supplierId: string;
    name: string;
    paymentMethod: string;
    oldIsPartner: boolean;
    newIsPartner: boolean;
  };

  const changes: Change[] = [];
  const alreadyOk: { name: string; isPartner: boolean; pm: string }[] = [];

  for (const erp of erpSuppliers) {
    const contact = contactMap.get(erp.holdedContactId);
    if (!contact) continue;

    const pmId = typeof contact.defaults?.paymentMethod === "string" && contact.defaults.paymentMethod !== "0"
      ? contact.defaults.paymentMethod : undefined;
    const pmName = pmId ? (pmNameMap.get(pmId) ?? `ID:${pmId}`) : "Sin método";
    const newIsPartner = PARTNER_PM_NAMES.has(pmName);

    if (erp.isPartner === newIsPartner) {
      alreadyOk.push({ name: erp.name, isPartner: newIsPartner, pm: pmName });
    } else {
      changes.push({
        supplierId: erp.id,
        name: erp.name,
        paymentMethod: pmName,
        oldIsPartner: erp.isPartner,
        newIsPartner,
      });
    }
  }

  console.log(`\nYa correctos: ${alreadyOk.length}  |  A modificar: ${changes.length}`);

  if (changes.length === 0) {
    console.log("Sin cambios necesarios.");
    return;
  }

  // Separar por tipo de cambio
  const toPartner   = changes.filter((c) => c.newIsPartner);
  const toProveedor = changes.filter((c) => !c.newIsPartner);

  if (toPartner.length > 0) {
    console.log(`\n[Proveedor → Partner] (${toPartner.length})`);
    for (const c of toPartner) console.log(`  · ${c.name.padEnd(50)} ${c.paymentMethod}`);
  }
  if (toProveedor.length > 0) {
    console.log(`\n[Partner → Proveedor] (${toProveedor.length})`);
    for (const c of toProveedor) console.log(`  · ${c.name.padEnd(50)} ${c.paymentMethod}`);
  }

  if (DRY_RUN) return;

  // Aplicar en batch
  console.log("\nAplicando...");
  let ok = 0;
  let errors = 0;
  for (const ch of changes) {
    try {
      await prisma.supplier.update({
        where: { id: ch.supplierId },
        data: { isPartner: ch.newIsPartner },
      });
      console.log(`  ✓ ${ch.name} → isPartner=${ch.newIsPartner}`);
      ok++;
    } catch (e) {
      console.log(`  ✗ ${ch.name}: ${e instanceof Error ? e.message : String(e)}`);
      errors++;
    }
  }
  console.log(`✓ ${ok} actualizados | ✗ ${errors} errores`);
}

async function main(): Promise<void> {
  console.log(`Modo: ${DRY_RUN ? "DRY RUN (sin cambios)" : "⚠️  APLICANDO CAMBIOS EN ERP"}\n`);
  console.log(`Criterio Partner: ${[...PARTNER_PM_NAMES].join(" | ")}`);

  const companies = await prisma.company.findMany({
    where: { active: true },
    select: { id: true, name: true, holdedApiKey: true },
    orderBy: { name: "asc" },
  });

  for (const company of companies) {
    await processCompany(company);
  }

  if (DRY_RUN) {
    console.log("\n──────────────────────────────────────────────────────────");
    console.log("DRY RUN completado. Para aplicar:");
    console.log("  DRY_RUN=false npx tsx scripts/sync-partner-from-payment-method.ts");
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
