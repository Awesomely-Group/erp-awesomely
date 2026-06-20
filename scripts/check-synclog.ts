import { PrismaClient, InvoiceType } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

function eur(n: unknown): string {
  const num = typeof n === "object" && n !== null && "toNumber" in (n as object)
    ? (n as { toNumber(): number }).toNumber()
    : Number(n);
  return num.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

async function main(): Promise<void> {
  const company = await prisma.company.findFirst({
    where: { active: true, name: { contains: "OU" } },
  });
  if (!company) { console.error("No OU company found"); process.exit(1); }

  console.log(`\n══ ${company.name} — Desglose de facturas ══\n`);

  for (const type of [InvoiceType.SALE, InvoiceType.PURCHASE] as InvoiceType[]) {
    const invoices = await prisma.invoice.findMany({
      where: { companyId: company.id, type },
      select: { number: true, counterparty: true, date: true, totalEur: true, holdedStatus: true, currency: true },
      orderBy: { date: "desc" },
    });

    const label = type === InvoiceType.SALE ? "VENTAS" : "COMPRAS";
    console.log(`── ${label} (${invoices.length}) ──`);

    // Por año
    const byYear = new Map<number, { count: number; totalEur: number }>();
    for (const inv of invoices) {
      const y = inv.date.getFullYear();
      const t = (inv.totalEur as unknown as { toNumber(): number }).toNumber();
      const cur = byYear.get(y) ?? { count: 0, totalEur: 0 };
      byYear.set(y, { count: cur.count + 1, totalEur: cur.totalEur + t });
    }
    console.log("\n  Por año:");
    for (const [year, { count, totalEur }] of [...byYear.entries()].sort((a, b) => b[0] - a[0])) {
      console.log(`    ${year}: ${String(count).padStart(4)} facturas  ${eur(totalEur).padStart(16)}`);
    }

    // Por estado
    const statusMap: Record<number, string> = { [-1]: "Anulada", 0: "Borrador", 1: "Pendiente", 2: "Pagada", 3: "Vencida" };
    const byStatus = new Map<string, { count: number; totalEur: number }>();
    for (const inv of invoices) {
      const s = statusMap[inv.holdedStatus ?? 0] ?? `Estado ${inv.holdedStatus}`;
      const t = (inv.totalEur as unknown as { toNumber(): number }).toNumber();
      const cur = byStatus.get(s) ?? { count: 0, totalEur: 0 };
      byStatus.set(s, { count: cur.count + 1, totalEur: cur.totalEur + t });
    }
    console.log("\n  Por estado:");
    for (const [status, { count, totalEur }] of [...byStatus.entries()].sort((a, b) => b[1].count - a[1].count)) {
      console.log(`    ${status.padEnd(12)}: ${String(count).padStart(4)} facturas  ${eur(totalEur).padStart(16)}`);
    }

    // Top 10 contrapartes por volumen
    const byCounterparty = new Map<string, { count: number; totalEur: number }>();
    for (const inv of invoices) {
      const cp = inv.counterparty ?? "(sin nombre)";
      const t = (inv.totalEur as unknown as { toNumber(): number }).toNumber();
      const cur = byCounterparty.get(cp) ?? { count: 0, totalEur: 0 };
      byCounterparty.set(cp, { count: cur.count + 1, totalEur: cur.totalEur + t });
    }
    const top10 = [...byCounterparty.entries()]
      .sort((a, b) => b[1].totalEur - a[1].totalEur)
      .slice(0, 10);
    console.log(`\n  Top 10 ${type === InvoiceType.SALE ? "clientes" : "proveedores"} por volumen (€):`);
    for (const [name, { count, totalEur }] of top10) {
      console.log(`    ${name.slice(0, 40).padEnd(40)}  ${String(count).padStart(4)} facturas  ${eur(totalEur).padStart(16)}`);
    }

    const totalSum = invoices.reduce((s, inv) => s + (inv.totalEur as unknown as { toNumber(): number }).toNumber(), 0);
    console.log(`\n  TOTAL: ${eur(totalSum)}\n`);
  }

  await prisma.$disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
