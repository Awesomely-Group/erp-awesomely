import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

function toEur(n: unknown): number {
  if (typeof n === "object" && n !== null && "toNumber" in (n as object))
    return (n as { toNumber(): number }).toNumber();
  return Number(n);
}
function eur(n: number): string {
  return n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

async function main(): Promise<void> {
  const invoices = await prisma.invoice.findMany({
    where: { removedFromHoldedAt: null },
    orderBy: [{ counterparty: "asc" }, { date: "desc" }],
    select: {
      id: true, counterparty: true, holdedContactId: true, date: true,
      totalEur: true, type: true, companyId: true, number: true,
      lines: { select: { name: true, description: true }, orderBy: { sortOrder: "asc" }, take: 1 },
    },
  });

  // Group by supplier key
  const byKey = new Map<string, typeof invoices>();
  for (const inv of invoices) {
    const key = `${inv.companyId}__${inv.holdedContactId ?? inv.counterparty ?? ""}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(inv);
  }

  function isInMonth(d: Date, ref: Date, offset: number): boolean {
    const t = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + offset, 1));
    return d.getUTCFullYear() === t.getUTCFullYear() && d.getUTCMonth() === t.getUTCMonth();
  }
  function isInYearWindow(d: Date, ref: Date, offsetYrs: number, marginMonths = 1): boolean {
    const t = new Date(Date.UTC(ref.getUTCFullYear() + offsetYrs, ref.getUTCMonth(), 1));
    const diff = (d.getUTCFullYear() - t.getUTCFullYear()) * 12 + (d.getUTCMonth() - t.getUTCMonth());
    return Math.abs(diff) <= marginMonths;
  }

  const ANUAL_KEYWORDS = /anual|analment|annual|yearly|renovac|renovaci|renewal|domini|domain|licencia|licència/i;
  const MENSUAL_KEYWORDS = /mensual|mensalment|monthly|suscripci|subscripci|subscription|membership/i;

  type Row = {
    counterparty: string; date: string; amount: string; concept: string; reason: string;
  };

  const anualCandidates: Row[] = [];
  const misclassifiedMensual: Row[] = [];
  const allAmounts: number[] = [];

  for (const inv of invoices) {
    const key = `${inv.companyId}__${inv.holdedContactId ?? inv.counterparty ?? ""}`;
    const siblings = byKey.get(key)!.filter((s) => s.id !== inv.id && s.companyId === inv.companyId);
    const ref = toEur(inv.totalEur);
    allAmounts.push(ref);
    const min = ref * 0.9; const max = ref * 1.1;
    const near = siblings.filter((s) => { const t = toEur(s.totalEur); return t >= min && t <= max; });

    const m1 = near.some((s) => isInMonth(s.date, inv.date, -1));
    const m2 = near.some((s) => isInMonth(s.date, inv.date, -2));
    const m3 = near.some((s) => isInMonth(s.date, inv.date, -3));
    const a1 = near.some((s) => isInYearWindow(s.date, inv.date, -1, 2));

    const isMensual = m1 && m2 && m3;
    const concept = inv.lines[0]?.name ?? "";
    const hasAnualKw = ANUAL_KEYWORDS.test(concept) || ANUAL_KEYWORDS.test(inv.counterparty ?? "");
    const hasMensualKw = MENSUAL_KEYWORDS.test(concept) || MENSUAL_KEYWORDS.test(inv.counterparty ?? "");

    // ANUAL candidates: has year-1 match (relaxed) OR annual keyword
    if (!isMensual && (a1 || hasAnualKw)) {
      anualCandidates.push({
        counterparty: inv.counterparty ?? "(desconocido)",
        date: inv.date.toISOString().slice(0, 10),
        amount: eur(ref),
        concept,
        reason: a1 ? (hasAnualKw ? "año-1 + keyword anual" : "año-1 ±2 meses") : "keyword anual",
      });
    }

    // Misclassified as puntual but likely mensual (keyword but not 3 months detected)
    if (!isMensual && hasMensualKw) {
      misclassifiedMensual.push({
        counterparty: inv.counterparty ?? "(desconocido)",
        date: inv.date.toISOString().slice(0, 10),
        amount: eur(ref),
        concept,
        reason: "keyword mensual, sin 3 meses detectados",
      });
    }
  }

  // EXTRAORDINARIO: amounts > 2x median of their company
  const byCompany = new Map<string, number[]>();
  for (const inv of invoices) {
    if (!byCompany.has(inv.companyId)) byCompany.set(inv.companyId, []);
    byCompany.get(inv.companyId)!.push(toEur(inv.totalEur));
  }
  const companyMedian = new Map<string, number>();
  for (const [cid, amounts] of byCompany) {
    const sorted = [...amounts].sort((a, b) => a - b);
    companyMedian.set(cid, sorted[Math.floor(sorted.length / 2)]);
  }

  const extraordCandidates: (Row & { threshold: string })[] = [];
  for (const inv of invoices) {
    const ref = toEur(inv.totalEur);
    const median = companyMedian.get(inv.companyId) ?? 0;
    const key = `${inv.companyId}__${inv.holdedContactId ?? inv.counterparty ?? ""}`;
    const siblings = byKey.get(key)!.filter((s) => s.id !== inv.id);
    const near = siblings.filter((s) => { const t = toEur(s.totalEur); return t >= ref * 0.9 && t <= ref * 1.1; });

    // Extraordinary: amount > 5x median AND no pattern
    if (ref > median * 5 && near.length === 0 && ref > 3000) {
      extraordCandidates.push({
        counterparty: inv.counterparty ?? "(desconocido)",
        date: inv.date.toISOString().slice(0, 10),
        amount: eur(ref),
        concept: inv.lines[0]?.name ?? "—",
        reason: `${(ref / median).toFixed(1)}x mediana (${eur(median)})`,
        threshold: eur(median * 5),
      });
    }
  }

  // Sort by amount desc
  extraordCandidates.sort((a, b) => {
    const pa = parseFloat(a.amount.replace(/[^0-9,]/g, "").replace(",", "."));
    const pb = parseFloat(b.amount.replace(/[^0-9,]/g, "").replace(",", "."));
    return pb - pa;
  });

  console.log("\n═══ CANDIDATOS ANUAL (algoritmo relajado: año-1 ±2 meses OR keyword) ═══");
  anualCandidates.slice(0, 30).forEach((r) => {
    console.log(`  [${r.date}] ${r.counterparty.slice(0, 34).padEnd(34)} ${r.amount.padStart(12)}  ${r.reason.slice(0,30).padEnd(30)} | ${r.concept.slice(0, 30)}`);
  });
  console.log(`  Total candidatos: ${anualCandidates.length}`);

  console.log("\n═══ POSIBLES MENSUAL MAL CLASIFICADOS (keyword sin patrón de 3 meses) ═══");
  misclassifiedMensual.slice(0, 20).forEach((r) => {
    console.log(`  [${r.date}] ${r.counterparty.slice(0, 34).padEnd(34)} ${r.amount.padStart(12)} | ${r.concept.slice(0, 40)}`);
  });
  console.log(`  Total: ${misclassifiedMensual.length}`);

  console.log("\n═══ CANDIDATOS EXTRAORDINARIO (>5x mediana empresa, sin patrón, >3.000€) ═══");
  extraordCandidates.slice(0, 25).forEach((r) => {
    console.log(`  [${r.date}] ${r.counterparty.slice(0, 34).padEnd(34)} ${r.amount.padStart(14)}  ${r.reason}`);
    console.log(`          Concepto: ${r.concept.slice(0, 60)}`);
  });
  console.log(`  Total candidatos: ${extraordCandidates.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
