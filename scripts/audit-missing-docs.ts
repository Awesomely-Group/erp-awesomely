/**
 * Auditoría de documentos faltantes entre Holded y la DB.
 *
 * 1. Comprueba si el documento específico (6967fc24ff42013871067a8e) es devuelto
 *    por el API de Holded en la ventana mensual normal y sin filtros de fecha.
 * 2. Audit completo: compara todos los IDs de Holded vs la DB y reporta cuántos
 *    documentos existen en Holded pero no en el ERP (y viceversa).
 *
 * Run:
 *   npx tsx --env-file=.env.local scripts/audit-missing-docs.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { HOLDED_SYNC_FROM_YEAR, type HoldedInvoiceV2Raw } from "../src/lib/holded";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const AWESOMELY_SL = "cmnbew1zp000004l6pjz4wp0y";

// ─── Holded API helpers ────────────────────────────────────────────────────────

async function holdedFetch(
  apiKey: string,
  path: string,
  params: Record<string, string> = {}
): Promise<HoldedInvoiceV2Raw[]> {
  const url = new URL(`https://api.holded.com/api/v2${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Holded ${path} → HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const raw = (await res.json()) as { items?: HoldedInvoiceV2Raw[] } | HoldedInvoiceV2Raw[];
  return Array.isArray(raw) ? raw : (raw.items ?? []);
}

/** Fetch single document by ID (v2 endpoint) */
async function holdedFetchOne(
  apiKey: string,
  path: string
): Promise<HoldedInvoiceV2Raw | null> {
  const url = `https://api.holded.com/api/v2${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    console.warn(`  ⚠  ${path} → HTTP ${res.status}: ${text.slice(0, 200)}`);
    return null;
  }

  return (await res.json()) as HoldedInvoiceV2Raw;
}

/** Full purchases download using the same monthly-window strategy as the sync */
async function fetchAllPurchases(apiKey: string): Promise<HoldedInvoiceV2Raw[]> {
  const now = new Date();
  const endYear = now.getFullYear();

  const windows: Array<{ start: string; end: string }> = [];
  for (let year = HOLDED_SYNC_FROM_YEAR; year <= endYear; year++) {
    const endMonth = year === endYear ? now.getMonth() + 1 : 12;
    for (let month = 1; month <= endMonth; month++) {
      const mm = String(month).padStart(2, "0");
      const lastDay = new Date(year, month, 0).getDate();
      windows.push({ start: `${year}-${mm}-01`, end: `${year}-${mm}-${lastDay}` });
    }
  }

  const batches = await Promise.all(
    windows.map(({ start, end }) =>
      holdedFetch(apiKey, "/purchases", { limit: "500", start_date: start, end_date: end })
        .catch((err: unknown) => {
          console.warn(`  ⚠  /purchases ${start}→${end}: ${err instanceof Error ? err.message : String(err)}`);
          return [] as HoldedInvoiceV2Raw[];
        })
    )
  );

  const seenIds = new Set<string>();
  const all: HoldedInvoiceV2Raw[] = [];
  for (const batch of batches) {
    for (const item of batch) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        all.push(item);
      }
    }
  }
  return all;
}

/** Full invoices (ventas) download */
async function fetchAllInvoices(apiKey: string): Promise<HoldedInvoiceV2Raw[]> {
  return holdedFetch(apiKey, "/invoices", { limit: "5000" });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const TARGET_ID = "6967fc24ff42013871067a8e";

async function main(): Promise<void> {
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: AWESOMELY_SL },
    select: { holdedApiKey: true },
  });
  const apiKey = company.holdedApiKey;

  // ── 1. Direct lookup of the specific document ────────────────────────────────
  console.log("\n════════════════════════════════════════════════════════");
  console.log("  PASO 1 — Lookup directo del documento problemático");
  console.log("════════════════════════════════════════════════════════");
  console.log(`  ID Holded: ${TARGET_ID}`);

  const direct = await holdedFetchOne(apiKey, `/purchases/${TARGET_ID}`);
  if (direct) {
    console.log("  ✅ /purchases/{id} → ENCONTRADO");
    console.log(`     document_number : ${direct.document_number ?? "(vacío)"}`);
    console.log(`     date            : ${direct.date}`);
    console.log(`     contact_name    : ${direct.contact_name}`);
    console.log(`     status          : ${direct.status}`);
    console.log(`     draft           : ${direct.draft}`);
    console.log(`     total           : ${direct.total}`);
  } else {
    console.log("  ❌ /purchases/{id} → NO devuelto por Holded (404 o error)");
  }

  // ── 2. Check in DB ───────────────────────────────────────────────────────────
  const dbInvoice = await prisma.invoice.findFirst({
    where: { holdedId: TARGET_ID, companyId: AWESOMELY_SL },
    select: { id: true, number: true, holdedStatus: true, date: true, status: true },
  });
  if (dbInvoice) {
    console.log(`  ✅ DB → EXISTE (id: ${dbInvoice.id}, number: ${dbInvoice.number ?? "(null)"}, holdedStatus: ${dbInvoice.holdedStatus})`);
  } else {
    console.log("  ❌ DB → NO EXISTE en la tabla invoices");
  }

  // ── 3. Check in Jan-2026 window ──────────────────────────────────────────────
  console.log("\n  Buscando en ventana 2026-01 del API…");
  const jan2026 = await holdedFetch(apiKey, "/purchases", {
    limit: "500",
    start_date: "2026-01-01",
    end_date:   "2026-01-31",
  }).catch((err: unknown) => {
    console.warn(`  ⚠  /purchases 2026-01: ${err instanceof Error ? err.message : String(err)}`);
    return [] as HoldedInvoiceV2Raw[];
  });
  const inWindow = jan2026.find((d) => d.id === TARGET_ID);
  console.log(`  Ventana 2026-01 devuelve ${jan2026.length} documentos.`);
  console.log(inWindow
    ? `  ✅ Documento ${TARGET_ID} SÍ está en la ventana mensual.`
    : `  ❌ Documento ${TARGET_ID} NO está en la ventana mensual (¿draft excluido?).`
  );

  // ── 4. Check without date filter ─────────────────────────────────────────────
  console.log("\n  Buscando en /purchases sin filtro de fecha…");
  const noFilter = await holdedFetch(apiKey, "/purchases", { limit: "500" }).catch(() => [] as HoldedInvoiceV2Raw[]);
  const inNoFilter = noFilter.find((d) => d.id === TARGET_ID);
  console.log(`  /purchases sin filtro devuelve ${noFilter.length} documentos.`);
  console.log(inNoFilter
    ? `  ✅ Documento ${TARGET_ID} SÍ aparece sin filtro de fecha.`
    : `  ❌ Documento ${TARGET_ID} NO aparece ni sin filtro de fecha.`
  );

  // ── 5. Full audit — Holded IDs vs DB IDs ────────────────────────────────────
  console.log("\n════════════════════════════════════════════════════════");
  console.log("  PASO 2 — Audit completo (Holded vs DB)");
  console.log("════════════════════════════════════════════════════════");
  console.log("  Descargando todos los documentos de Holded…");

  const [holdedPurchases, holdedInvoices] = await Promise.all([
    fetchAllPurchases(apiKey),
    fetchAllInvoices(apiKey),
  ]);

  console.log(`  Holded devuelve: ${holdedPurchases.length} compras, ${holdedInvoices.length} ventas`);

  const holdedPurchaseIds = new Set(holdedPurchases.map((d) => d.id));
  const holdedInvoiceIds  = new Set(holdedInvoices.map((d) => d.id));

  // All holdedIds returned by Holded
  const allHoldedIds = new Set([...holdedPurchaseIds, ...holdedInvoiceIds]);

  // All holdedIds in DB
  const dbRecords = await prisma.invoice.findMany({
    where: { companyId: AWESOMELY_SL },
    select: { holdedId: true, type: true, number: true, date: true, counterparty: true, holdedStatus: true, removedFromHoldedAt: true },
  });

  const dbHoldedIds = new Set(dbRecords.map((r) => r.holdedId));

  // In Holded but NOT in DB (missing from ERP)
  const missingInDb: HoldedInvoiceV2Raw[] = [];
  for (const doc of [...holdedPurchases, ...holdedInvoices]) {
    if (!dbHoldedIds.has(doc.id)) missingInDb.push(doc);
  }

  // In DB but NOT in Holded (orphans — already removed from Holded or old)
  const orphansInDb = dbRecords.filter(
    (r) => !allHoldedIds.has(r.holdedId) && r.removedFromHoldedAt === null
  );

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log("\n────────────────────────────────────────────────────────");
  console.log("  RESUMEN");
  console.log("────────────────────────────────────────────────────────");
  console.log(`  DB total    : ${dbRecords.length} facturas`);
  console.log(`  Holded total: ${holdedPurchases.length + holdedInvoices.length} documentos`);
  console.log(`  Faltan en DB: ${missingInDb.length} documentos (están en Holded pero no en ERP)`);
  console.log(`  Huérfanos DB: ${orphansInDb.length} facturas (en DB pero no en Holded, sin removedAt)`);

  if (missingInDb.length > 0) {
    console.log("\n  Documentos en Holded NO encontrados en la DB:");
    console.log("  " + ["ID Holded", "Tipo", "DocNumber", "Fecha", "Contacto", "Total", "Status", "Draft"].map((h) => h.padEnd(28)).join(" "));
    console.log("  " + "─".repeat(200));
    for (const doc of missingInDb) {
      const tipo = holdedPurchaseIds.has(doc.id) ? "COMPRA" : "VENTA";
      const cols = [
        doc.id,
        tipo,
        (doc.document_number ?? "(vacío)"),
        doc.date,
        (doc.contact_name ?? "").slice(0, 25),
        (doc.total ?? "—"),
        (doc.status ?? "—"),
        String(doc.draft ?? false),
      ].map((v) => String(v).padEnd(28));
      console.log("  " + cols.join(" "));
    }
  }

  if (orphansInDb.length > 0 && orphansInDb.length <= 20) {
    console.log("\n  Facturas huérfanas en DB (sin removedFromHoldedAt):");
    for (const r of orphansInDb) {
      console.log(`    ${r.holdedId}  ${r.type}  ${r.number ?? "(sin num)"}  ${r.counterparty ?? ""}  holdedStatus=${r.holdedStatus}`);
    }
  } else if (orphansInDb.length > 20) {
    console.log(`\n  (${orphansInDb.length} huérfanos — demasiados para listar, usa mark-removed-from-holded.ts)`);
  }

  await prisma.$disconnect();
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
