import { prisma } from "./prisma";

export interface PlParams {
  year?: string;
}

interface RevenueRow {
  company_id: string;
  company_name: string;
  month: Date;
  revenue: unknown;
}

interface ExpenseRow {
  company_id: string;
  company_name: string;
  month: Date;
  l1: string;
  expense: unknown;
}

export interface PlMonthPoint {
  monthKey: string;
  monthLabel: string;
  revenue: number;
  expensesByL1: Record<string, number>;
  totalExpenses: number;
  result: number;
}

export interface PlEntityData {
  companyId: string;
  companyName: string;
  months: PlMonthPoint[];
  yearly: {
    revenue: number;
    expensesByL1: Record<string, number>;
    totalExpenses: number;
    result: number;
  };
}

export interface PlData {
  year: number;
  entities: PlEntityData[];
  consolidated: PlEntityData;
  l1Categories: string[];
}

function buildMonthMap(year: number): Map<string, PlMonthPoint> {
  const map = new Map<string, PlMonthPoint>();
  for (let m = 0; m < 12; m++) {
    const d = new Date(year, m, 1);
    const monthKey = `${year}-${String(m + 1).padStart(2, "0")}`;
    const monthLabel = d
      .toLocaleDateString("es-ES", { month: "short" })
      .replace(".", "")
      .toUpperCase();
    map.set(monthKey, {
      monthKey,
      monthLabel,
      revenue: 0,
      expensesByL1: {},
      totalExpenses: 0,
      result: 0,
    });
  }
  return map;
}

export async function getPlData(params: PlParams): Promise<PlData> {
  const year = params.year ? parseInt(params.year, 10) : new Date().getFullYear();
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year + 1, 0, 1);

  const [revenueRows, expenseRows] = await Promise.all([
    prisma.$queryRaw<RevenueRow[]>`
      SELECT
        c.id              AS company_id,
        c.name            AS company_name,
        DATE_TRUNC('month', COALESCE(i."accountingMonth", i.date)) AS month,
        SUM(i.subtotal * i."fxRateToEur") AS revenue
      FROM invoices i
      JOIN companies c ON c.id = i."companyId"
      WHERE i.type::text = 'SALE'
        AND (i."holdedStatus" IS NULL OR i."holdedStatus" != -1)
        AND COALESCE(i."accountingMonth", i.date) >= ${startDate}
        AND COALESCE(i."accountingMonth", i.date) < ${endDate}
      GROUP BY c.id, c.name, DATE_TRUNC('month', COALESCE(i."accountingMonth", i.date))
      ORDER BY month
    `,
    prisma.$queryRaw<ExpenseRow[]>`
      SELECT
        c.id              AS company_id,
        c.name            AS company_name,
        DATE_TRUNC('month', COALESCE(i."accountingMonth", i.date)) AS month,
        COALESCE(am.l1, 'Otros') AS l1,
        SUM(il.subtotal * i."fxRateToEur") AS expense
      FROM invoices i
      JOIN companies c ON c.id = i."companyId"
      JOIN invoice_lines il ON il."invoiceId" = i.id
      LEFT JOIN LATERAL (
        SELECT l1 FROM account_mappings
        WHERE il."accountingAccount" IS NOT NULL
          AND ("accountNumSL" = il."accountingAccount" OR "accountNumOU" = il."accountingAccount")
        ORDER BY id
        LIMIT 1
      ) am ON true
      WHERE i.type::text = 'PURCHASE'
        AND (i."holdedStatus" IS NULL OR i."holdedStatus" != -1)
        AND COALESCE(i."accountingMonth", i.date) >= ${startDate}
        AND COALESCE(i."accountingMonth", i.date) < ${endDate}
      GROUP BY c.id, c.name, DATE_TRUNC('month', COALESCE(i."accountingMonth", i.date)), COALESCE(am.l1, 'Otros')
      ORDER BY month, l1
    `,
  ]);

  const entityMap = new Map<string, { name: string; months: Map<string, PlMonthPoint> }>();

  const ensureEntity = (id: string, name: string) => {
    if (!entityMap.has(id)) {
      entityMap.set(id, { name, months: buildMonthMap(year) });
    }
    return entityMap.get(id)!;
  };

  for (const row of revenueRows) {
    const entity = ensureEntity(row.company_id, row.company_name);
    const d = new Date(row.month);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const point = entity.months.get(monthKey);
    if (point) point.revenue += Number(row.revenue);
  }

  const allL1 = new Set<string>();
  for (const row of expenseRows) {
    const entity = ensureEntity(row.company_id, row.company_name);
    const d = new Date(row.month);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const point = entity.months.get(monthKey);
    if (point) {
      point.expensesByL1[row.l1] = (point.expensesByL1[row.l1] ?? 0) + Number(row.expense);
      point.totalExpenses += Number(row.expense);
    }
    if (row.l1 !== "Otros") allL1.add(row.l1);
  }

  const consolidatedMonths = buildMonthMap(year);
  const entities: PlEntityData[] = [];

  for (const [companyId, { name, months }] of entityMap) {
    const monthsArray = Array.from(months.values());
    for (const p of monthsArray) {
      p.result = p.revenue - p.totalExpenses;
    }

    const yearly = {
      revenue: monthsArray.reduce((s, m) => s + m.revenue, 0),
      expensesByL1: {} as Record<string, number>,
      totalExpenses: monthsArray.reduce((s, m) => s + m.totalExpenses, 0),
      result: 0,
    };
    for (const m of monthsArray) {
      for (const [l1, amt] of Object.entries(m.expensesByL1)) {
        yearly.expensesByL1[l1] = (yearly.expensesByL1[l1] ?? 0) + amt;
      }
    }
    yearly.result = yearly.revenue - yearly.totalExpenses;

    entities.push({ companyId, companyName: name, months: monthsArray, yearly });

    for (const p of monthsArray) {
      const cp = consolidatedMonths.get(p.monthKey)!;
      cp.revenue += p.revenue;
      cp.totalExpenses += p.totalExpenses;
      for (const [l1, amt] of Object.entries(p.expensesByL1)) {
        cp.expensesByL1[l1] = (cp.expensesByL1[l1] ?? 0) + amt;
      }
    }
  }

  const consolidatedArray = Array.from(consolidatedMonths.values());
  for (const cp of consolidatedArray) cp.result = cp.revenue - cp.totalExpenses;

  const consolidatedYearly = {
    revenue: consolidatedArray.reduce((s, m) => s + m.revenue, 0),
    expensesByL1: {} as Record<string, number>,
    totalExpenses: consolidatedArray.reduce((s, m) => s + m.totalExpenses, 0),
    result: 0,
  };
  for (const m of consolidatedArray) {
    for (const [l1, amt] of Object.entries(m.expensesByL1)) {
      consolidatedYearly.expensesByL1[l1] = (consolidatedYearly.expensesByL1[l1] ?? 0) + amt;
    }
  }
  consolidatedYearly.result = consolidatedYearly.revenue - consolidatedYearly.totalExpenses;

  entities.sort((a, b) => a.companyName.localeCompare(b.companyName));

  const l1Categories = [...allL1].sort();
  if (expenseRows.some((r) => r.l1 === "Otros")) l1Categories.push("Otros");

  return {
    year,
    entities,
    consolidated: {
      companyId: "consolidated",
      companyName: "Consolidado",
      months: consolidatedArray,
      yearly: consolidatedYearly,
    },
    l1Categories,
  };
}

export async function getPlYears(): Promise<number[]> {
  const rows = await prisma.$queryRaw<{ year: number }[]>`
    SELECT DISTINCT DATE_PART('year', COALESCE("accountingMonth", date))::int AS year
    FROM invoices
    WHERE "holdedStatus" IS NULL OR "holdedStatus" != -1
    ORDER BY year DESC
  `;
  return rows.map((r) => Number(r.year));
}
