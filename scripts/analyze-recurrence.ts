/**
 * Script temporal para analizar patrones de recurrencia en facturas.
 * Uso: npx tsx --env-file=.env.local scripts/analyze-recurrence.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

function toEur(n: unknown): number {
  if (typeof n === "object" && n !== null && "toNumber" in (n as object)) {
    return (n as { toNumber(): number }).toNumber();
  }
  return Number(n);
}

function eur(n: unknown): string {
  return toEur(n).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

async function main(): Promise<void> {
  const invoices = await prisma.invoice.findMany({
    where: { removedFromHoldedAt: null },
    orderBy: { date: "desc" },
    select: {
      id: true,
      counterparty: true,
      holdedContactId: true,
      date: true,
      totalEur: true,
      type: true,
      companyId: true,
      lines: { select: { name: true }, orderBy: { sortOrder: "asc" }, take: 1 },
    },
  });

  console.log(`Total facturas analizadas: ${invoices.length}\n`);

  // Agrupar por (companyId + holdedContactId o counterparty)
  const byKey = new Map<string, typeof invoices>();
  for (const inv of invoices) {
    const key = `${inv.companyId}__${inv.holdedContactId ?? inv.counterparty ?? "(desconocido)"}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(inv);
  }

  function isInMonth(d: Date, ref: Date, offset: number): boolean {
    const t = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + offset, 1));
    return d.getUTCFullYear() === t.getUTCFullYear() && d.getUTCMonth() === t.getUTCMonth();
  }

  function isInYearWindow(d: Date, ref: Date, offsetYears: number): boolean {
    const t = new Date(Date.UTC(ref.getUTCFullYear() + offsetYears, ref.getUTCMonth(), 1));
    const diffMonths = (d.getUTCFullYear() - t.getUTCFullYear()) * 12 + (d.getUTCMonth() - t.getUTCMonth());
    return Math.abs(diffMonths) <= 1;
  }

  type Row = { counterparty: string; date: string; amount: string; concept: string; pattern: string };
  const mensual: Row[] = [];
  const anual: Row[] = [];
  const puntual: Row[] = [];

  for (const inv of invoices) {
    const key = `${inv.companyId}__${inv.holdedContactId ?? inv.counterparty ?? "(desconocido)"}`;
    const siblings = byKey.get(key)!.filter((s) => s.id !== inv.id);
    const ref = toEur(inv.totalEur);
    const min = ref * 0.9;
    const max = ref * 1.1;

    const near = siblings.filter((s) => {
      const t = toEur(s.totalEur);
      return t >= min && t <= max;
    });

    const m1 = near.some((s) => isInMonth(s.date, inv.date, -1));
    const m2 = near.some((s) => isInMonth(s.date, inv.date, -2));
    const m3 = near.some((s) => isInMonth(s.date, inv.date, -3));
    const a1 = near.some((s) => isInYearWindow(s.date, inv.date, -1));
    const a2 = near.some((s) => isInYearWindow(s.date, inv.date, -2));

    const row: Row = {
      counterparty: inv.counterparty ?? "(desconocido)",
      date: inv.date.toISOString().slice(0, 10),
      amount: eur(ref),
      concept: inv.lines[0]?.name ?? "—",
      pattern: "",
    };

    if (m1 && m2 && m3) {
      row.pattern = "MENSUAL";
      mensual.push(row);
    } else if (a1 && a2) {
      row.pattern = "ANUAL";
      anual.push(row);
    } else {
      row.pattern = "PUNTUAL";
      puntual.push(row);
    }
  }

  const print = (rows: Row[], label: string) => {
    console.log(`═══ ${label} (${rows.length} facturas) ═══`);
    rows.slice(0, 25).forEach((r) => {
      const cp = r.counterparty.slice(0, 36).padEnd(36);
      const amt = r.amount.padStart(14);
      const concept = r.concept.slice(0, 35);
      console.log(`  [${r.date}] ${cp} ${amt}  ${concept}`);
    });
    console.log();
  };

  print(mensual, "MENSUAL");
  print(anual, "ANUAL");
  print(puntual, "PUNTUAL");

  console.log("═══ RESUMEN ═══");
  console.log(`  MENSUAL:  ${mensual.length} (${((mensual.length / invoices.length) * 100).toFixed(1)}%)`);
  console.log(`  ANUAL:    ${anual.length} (${((anual.length / invoices.length) * 100).toFixed(1)}%)`);
  console.log(`  PUNTUAL:  ${puntual.length} (${((puntual.length / invoices.length) * 100).toFixed(1)}%)`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
