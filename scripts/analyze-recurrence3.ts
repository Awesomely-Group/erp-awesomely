import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  // Get all unique PURCHASE counterparties that have billing patterns similar to partners
  // (individuals with recurring but project-based invoices)
  const purchases = await prisma.invoice.findMany({
    where: { removedFromHoldedAt: null, type: "PURCHASE" },
    select: {
      counterparty: true,
      holdedContactId: true,
      date: true,
      totalEur: true,
      lines: { select: { name: true }, orderBy: { sortOrder: "asc" }, take: 1 },
    },
    orderBy: { date: "desc" },
  });

  // Count occurrences per supplier
  const bySupplier = new Map<string, { name: string; contactId: string | null; count: number; amounts: number[]; concepts: string[] }>();
  for (const inv of purchases) {
    const key = inv.holdedContactId ?? inv.counterparty ?? "(desconocido)";
    const name = inv.counterparty ?? "(desconocido)";
    const amount = typeof inv.totalEur === "object" && inv.totalEur !== null && "toNumber" in inv.totalEur
      ? (inv.totalEur as { toNumber(): number }).toNumber() : Number(inv.totalEur);
    if (!bySupplier.has(key)) bySupplier.set(key, { name, contactId: inv.holdedContactId, count: 0, amounts: [], concepts: [] });
    const s = bySupplier.get(key)!;
    s.count++;
    s.amounts.push(amount);
    const concept = inv.lines[0]?.name ?? "";
    if (concept && !s.concepts.includes(concept)) s.concepts.push(concept);
  }

  // Show all suppliers sorted by count, with their avg amount
  const rows = [...bySupplier.values()]
    .map((s) => ({
      name: s.name,
      contactId: s.contactId,
      count: s.count,
      avgAmount: s.amounts.reduce((a, b) => a + b, 0) / s.amounts.length,
      maxAmount: Math.max(...s.amounts),
      concepts: s.concepts.slice(0, 2).join(" | "),
    }))
    .sort((a, b) => b.count - a.count);

  console.log("Todos los proveedores de COMPRAS (ordenados por número de facturas):\n");
  console.log("Nº fact | Promedio EUR | Máximo EUR  | Proveedor                                | Concepto");
  console.log("--------|-------------|-------------|------------------------------------------|-------------------------------");
  for (const r of rows) {
    const avg = r.avgAmount.toLocaleString("es-ES", { maximumFractionDigits: 0 }) + " €";
    const max = r.maxAmount.toLocaleString("es-ES", { maximumFractionDigits: 0 }) + " €";
    console.log(
      `  ${String(r.count).padStart(5)}  | ${avg.padStart(12)} | ${max.padStart(11)} | ${r.name.slice(0, 40).padEnd(40)} | ${r.concepts.slice(0, 40)}`
    );
  }
  console.log(`\nTotal proveedores únicos: ${rows.length}`);
  console.log(`Total facturas COMPRAS: ${purchases.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
