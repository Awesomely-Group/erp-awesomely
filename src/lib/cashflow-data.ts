import { Prisma, ForecastType } from "@prisma/client";
import { prisma } from "./prisma";
import { getDateRange } from "./date-range";
import { MARCA_FILTER_UNASSIGNED, invoiceWhereMarca, proformaWhereMarca } from "./org";
import { HoldedClient } from "./holded";

export type CashflowParams = {
  period?: string;
  dateFrom?: string;
  dateTo?: string;
  marca?: string;
  company?: string;
  account?: string;
  l1?: string;
  selectedMonth?: string;
  scenario?: string;
};

export type CashflowMonthlyPoint = {
  monthKey: string;
  monthLabel: string;
  inflowsBase: number;
  inflowsTax: number;
  inflows: number;
  outflowsBase: number;
  outflowsTax: number;
  outflows: number;
  net: number;
  forecastInflows: number;
  forecastOutflows: number;
  trendInflows: number;
  trendOutflows: number;
};

export type CashflowKpis = {
  totalInflows: number;
  totalOutflows: number;
  netCashflow: number;
  monthCount: number;
  totalForecastInflows: number;
  totalForecastOutflows: number;
};

type RawMonthlyRow = {
  month: Date;
  invoice_type: string;
  subtotal_eur: unknown;
  total_eur: unknown;
};

type ProformaMonthRow = { month: Date; total_eur: unknown };
type ForecastMonthRow = { month: Date; type: string; pessimistic: unknown; optimistic: unknown };

function resolveDateRange(params: CashflowParams): { gte?: Date; lte?: Date } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  switch (params.period) {
    case "last_3_months":
      return { gte: new Date(y, m - 3, 1) };
    case "last_6_months":
      return { gte: new Date(y, m - 6, 1) };
    case "last_12_months":
      return { gte: new Date(y, m - 12, 1) };
    case "this_year":
    case "custom":
      return getDateRange(params.period, params.dateFrom, params.dateTo);
    default:
      return { gte: new Date(y, m - 12, 1) };
  }
}

export async function getCashflowData(
  rawParams: CashflowParams,
  withForecast = true
): Promise<{ monthly: CashflowMonthlyPoint[]; kpis: CashflowKpis }> {
  // Resolve l1 → account numbers
  const l1List = rawParams.l1?.split(",").filter(Boolean) ?? [];
  let params = rawParams;
  if (l1List.length > 0) {
    const mappings = await prisma.accountMapping.findMany({ where: { l1: { in: l1List } } });
    const l1Accounts = [
      ...new Set(
        mappings.flatMap((m) => [m.accountNumSL, m.accountNumOU].filter(Boolean) as string[])
      ),
    ];
    const explicitAccounts = rawParams.account?.split(",").filter(Boolean) ?? [];
    const resolvedAccounts =
      explicitAccounts.length > 0
        ? l1Accounts.filter((a) => explicitAccounts.includes(a))
        : l1Accounts;
    params = { ...rawParams, account: resolvedAccounts.join(",") || undefined };
  }

  const dateRange = resolveDateRange(params);
  const accounts = params.account?.split(",").filter(Boolean) ?? [];
  let rows: RawMonthlyRow[];

  if (accounts.length > 0) {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`il."accountingAccount" IN (${Prisma.join(accounts.map((a) => Prisma.sql`${a}`))})`,
    ];
    if (dateRange.gte) conditions.push(Prisma.sql`i.date >= ${dateRange.gte}`);
    if (dateRange.lte) conditions.push(Prisma.sql`i.date <= ${dateRange.lte}`);
    {
      const marcaList = params.marca?.split(",").filter(Boolean) ?? [];
      const hasUnassigned = marcaList.includes(MARCA_FILTER_UNASSIGNED);
      const namedMarcas = marcaList.filter((m) => m !== MARCA_FILTER_UNASSIGNED);
      if (marcaList.length > 0) {
        const mc: Prisma.Sql[] = [];
        if (hasUnassigned) mc.push(Prisma.sql`i.marca IS NULL`);
        if (namedMarcas.length > 0)
          mc.push(Prisma.sql`i.marca IN (${Prisma.join(namedMarcas.map((m) => Prisma.sql`${m}`))})`);
        if (mc.length === 1) conditions.push(mc[0]);
        else conditions.push(Prisma.sql`(${Prisma.join(mc, " OR ")})`);
      }
    }
    if (params.company) conditions.push(Prisma.sql`i."companyId" = ${params.company}`);

    const where = Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
    rows = await prisma.$queryRaw<RawMonthlyRow[]>`
      SELECT
        DATE_TRUNC('month', i.date)         AS month,
        i.type                              AS invoice_type,
        SUM(il.subtotal * i."fxRateToEur")  AS subtotal_eur,
        SUM(il."totalEur")                  AS total_eur
      FROM invoices i
      JOIN invoice_lines il ON il."invoiceId" = i.id
      ${where}
      GROUP BY DATE_TRUNC('month', i.date), i.type
      ORDER BY month ASC
    `;
  } else {
    const conditions: Prisma.Sql[] = [];
    if (dateRange.gte) conditions.push(Prisma.sql`date >= ${dateRange.gte}`);
    if (dateRange.lte) conditions.push(Prisma.sql`date <= ${dateRange.lte}`);
    {
      const marcaList = params.marca?.split(",").filter(Boolean) ?? [];
      const hasUnassigned = marcaList.includes(MARCA_FILTER_UNASSIGNED);
      const namedMarcas = marcaList.filter((m) => m !== MARCA_FILTER_UNASSIGNED);
      if (marcaList.length > 0) {
        const mc: Prisma.Sql[] = [];
        if (hasUnassigned) mc.push(Prisma.sql`marca IS NULL`);
        if (namedMarcas.length > 0)
          mc.push(Prisma.sql`marca IN (${Prisma.join(namedMarcas.map((m) => Prisma.sql`${m}`))})`);
        if (mc.length === 1) conditions.push(mc[0]);
        else conditions.push(Prisma.sql`(${Prisma.join(mc, " OR ")})`);
      }
    }
    if (params.company) conditions.push(Prisma.sql`"companyId" = ${params.company}`);

    const where =
      conditions.length > 0
        ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`
        : Prisma.empty;

    rows = await prisma.$queryRaw<RawMonthlyRow[]>`
      SELECT
        DATE_TRUNC('month', date)         AS month,
        type                              AS invoice_type,
        SUM(subtotal * "fxRateToEur")     AS subtotal_eur,
        SUM("totalEur")                   AS total_eur
      FROM invoices
      ${where}
      GROUP BY DATE_TRUNC('month', date), type
      ORDER BY month ASC
    `;
  }

  const scenario = params.scenario === "optimistic" ? "optimistic" : "pessimistic";
  const [proformaRows, forecastRows] = withForecast
    ? await Promise.all([
        prisma.$queryRaw<ProformaMonthRow[]>`
          SELECT DATE_TRUNC('month', date) AS month, SUM("totalEur") AS total_eur
          FROM proformas
          WHERE "holdedStatus" IN (0, 1)
          ${dateRange.gte ? Prisma.sql`AND date >= ${dateRange.gte}` : Prisma.empty}
          ${dateRange.lte ? Prisma.sql`AND date <= ${dateRange.lte}` : Prisma.empty}
          GROUP BY DATE_TRUNC('month', date)
          ORDER BY month ASC
        `,
        prisma.$queryRaw<ForecastMonthRow[]>`
          SELECT DATE_TRUNC('month', month) AS month, type,
            SUM("amountPessimistic") AS pessimistic,
            SUM("amountOptimistic") AS optimistic
          FROM forecasts
          ${dateRange.gte ? Prisma.sql`WHERE month >= ${dateRange.gte}` : Prisma.empty}
          ${
            dateRange.lte
              ? dateRange.gte
                ? Prisma.sql`AND month <= ${dateRange.lte}`
                : Prisma.sql`WHERE month <= ${dateRange.lte}`
              : Prisma.empty
          }
          GROUP BY DATE_TRUNC('month', month), type
          ORDER BY month ASC
        `,
      ])
    : [[], []];

  const pointMap = new Map<string, CashflowMonthlyPoint>();

  const ensurePoint = (d: Date): CashflowMonthlyPoint => {
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const monthLabel = d.toLocaleDateString("es-ES", { month: "short", year: "numeric" });
    if (!pointMap.has(monthKey)) {
      pointMap.set(monthKey, {
        monthKey,
        monthLabel,
        inflowsBase: 0,
        inflowsTax: 0,
        inflows: 0,
        outflowsBase: 0,
        outflowsTax: 0,
        outflows: 0,
        net: 0,
        forecastInflows: 0,
        forecastOutflows: 0,
        trendInflows: 0,
        trendOutflows: 0,
      });
    }
    return pointMap.get(monthKey)!;
  };

  for (const row of rows) {
    const d = new Date(row.month);
    const point = ensurePoint(d);
    const subtotalAmt = Number(row.subtotal_eur);
    const totalAmt = Number(row.total_eur);
    const taxAmt = totalAmt - subtotalAmt;
    if (row.invoice_type === "SALE") {
      point.inflowsBase += subtotalAmt;
      point.inflowsTax += taxAmt;
      point.inflows = point.inflowsBase + point.inflowsTax;
    } else {
      point.outflowsBase += subtotalAmt;
      point.outflowsTax += taxAmt;
      point.outflows = point.outflowsBase + point.outflowsTax;
    }
    point.net = point.inflows - point.outflows;
  }

  for (const row of proformaRows) {
    const d = new Date(row.month);
    const point = ensurePoint(d);
    point.forecastInflows += Number(row.total_eur);
  }

  for (const row of forecastRows) {
    const d = new Date(row.month);
    const point = ensurePoint(d);
    const amount = Number(scenario === "optimistic" ? row.optimistic : row.pessimistic);
    if (row.type === ForecastType.INCOME) {
      point.forecastInflows += amount;
    } else {
      point.forecastOutflows += amount;
    }
  }

  const monthly = Array.from(pointMap.values()).sort((a, b) =>
    a.monthKey.localeCompare(b.monthKey)
  );

  if (withForecast) {
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    for (let i = 0; i < monthly.length; i++) {
      const point = monthly[i];
      const isPast = point.monthKey < currentMonthKey;
      if (isPast) {
        point.trendInflows = point.inflows;
        point.trendOutflows = point.outflows;
      } else {
        const pastActuals = monthly
          .slice(0, i)
          .filter((p) => p.monthKey < currentMonthKey);
        const win = pastActuals.slice(-3);
        const avgInflows =
          win.length > 0 ? win.reduce((s, p) => s + p.inflows, 0) / win.length : 0;
        const avgOutflows =
          win.length > 0 ? win.reduce((s, p) => s + p.outflows, 0) / win.length : 0;
        point.trendInflows = avgInflows + point.forecastInflows;
        point.trendOutflows = avgOutflows + point.forecastOutflows;
      }
    }
  }

  const kpis: CashflowKpis = {
    totalInflows: monthly.reduce((s, p) => s + p.inflows, 0),
    totalOutflows: monthly.reduce((s, p) => s + p.outflows, 0),
    netCashflow: monthly.reduce((s, p) => s + p.net, 0),
    monthCount: monthly.length,
    totalForecastInflows: monthly.reduce((s, p) => s + p.forecastInflows, 0),
    totalForecastOutflows: monthly.reduce((s, p) => s + p.forecastOutflows, 0),
  };

  return { monthly, kpis };
}

export async function getMonthInvoices(
  params: CashflowParams,
  monthKey: string
): Promise<{
  id: string;
  holdedId: string;
  number: string | null;
  type: string;
  counterparty: string | null;
  date: Date;
  totalEur: unknown;
  status: string;
  company: { name: string };
}[]> {
  const [yearStr, monthStr] = monthKey.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 0, 23, 59, 59, 999);

  const accounts = params.account?.split(",").filter(Boolean) ?? [];
  const marcaFilter = invoiceWhereMarca(params.marca);
  const where: Prisma.InvoiceWhereInput = {
    date: { gte: from, lte: to },
    ...(marcaFilter ?? {}),
    ...(params.company ? { companyId: params.company } : {}),
    ...(accounts.length > 0
      ? { lines: { some: { accountingAccount: { in: accounts } } } }
      : {}),
  };

  return prisma.invoice.findMany({
    where,
    select: {
      id: true,
      holdedId: true,
      number: true,
      type: true,
      counterparty: true,
      date: true,
      totalEur: true,
      status: true,
      company: { select: { name: true } },
    },
    orderBy: [{ type: "asc" }, { date: "asc" }],
  }) as Promise<{
    id: string;
    holdedId: string;
    number: string | null;
    type: string;
    counterparty: string | null;
    date: Date;
    totalEur: unknown;
    status: string;
    company: { name: string };
  }[]>;
}

export async function getMonthProformas(
  params: CashflowParams,
  monthKey: string
): Promise<{
  id: string;
  holdedId: string;
  number: string | null;
  counterparty: string | null;
  date: Date;
  totalEur: unknown;
  company: { name: string };
}[]> {
  const [yearStr, monthStr] = monthKey.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 0, 23, 59, 59, 999);

  const marcaFilter = proformaWhereMarca(params.marca);
  const where: Prisma.ProformaWhereInput = {
    date: { gte: from, lte: to },
    ...(marcaFilter ?? {}),
    ...(params.company ? { companyId: params.company } : {}),
  };

  return prisma.proforma.findMany({
    where,
    select: {
      id: true,
      holdedId: true,
      number: true,
      counterparty: true,
      date: true,
      totalEur: true,
      company: { select: { name: true } },
    },
    orderBy: { date: "asc" },
  });
}

export async function getCashflowCompanies(): Promise<{ id: string; name: string }[]> {
  return prisma.company.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function getCashflowAccounts(): Promise<{ num: string; name: string }[]> {
  const [rows, companies] = await Promise.all([
    prisma.invoiceLine.findMany({
      where: { accountingAccount: { not: null } },
      select: { accountingAccount: true, accountingAccountName: true },
      distinct: ["accountingAccount"],
      orderBy: { accountingAccount: "asc" },
    }),
    prisma.company.findMany({ where: { active: true }, select: { holdedApiKey: true } }),
  ]);

  const holdedById = new Map<string, string>();
  const holdedByNum = new Map<string, string>();

  await Promise.all(
    companies.map(async (c) => {
      const maps = await new HoldedClient(c.holdedApiKey).getAccountMaps();
      for (const [k, v] of maps.byId) holdedById.set(k, v.name);
      for (const [k, v] of maps.byNum) holdedByNum.set(k, v);
    })
  );

  const result: { num: string; name: string }[] = [];
  for (const r of rows) {
    const dbKey = r.accountingAccount!;
    const name = r.accountingAccountName ?? holdedById.get(dbKey) ?? holdedByNum.get(dbKey);
    if (name) result.push({ num: dbKey, name });
  }
  return result;
}
