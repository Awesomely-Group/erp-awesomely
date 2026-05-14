import { Suspense } from "react";
import { Prisma, InvoiceType, ForecastType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate, holdedInvoiceUrl, holdedProformaUrl } from "@/lib/utils";
import { getDateRange } from "@/lib/date-range";
import { MARCA_FILTER_UNASSIGNED, invoiceWhereMarca, proformaWhereMarca } from "@/lib/org";
import { HoldedClient } from "@/lib/holded";
import Link from "next/link";
import { CashflowFilters } from "./cashflow-filters";
import { CashflowChart, type CashflowMonthlyPoint } from "./cashflow-chart";

type CashflowParams = {
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

type CashflowKpis = {
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

type ProformaMonthRow = { month: Date; total_eur: unknown };
type ForecastMonthRow = { month: Date; type: string; pessimistic: unknown; optimistic: unknown };

async function getCashflowData(params: CashflowParams): Promise<{
  monthly: CashflowMonthlyPoint[];
  kpis: CashflowKpis;
}> {
  const dateRange = resolveDateRange(params);
  let rows: RawMonthlyRow[];

  const accounts = params.account?.split(",").filter(Boolean) ?? [];

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
        if (namedMarcas.length > 0) mc.push(Prisma.sql`i.marca IN (${Prisma.join(namedMarcas.map((m) => Prisma.sql`${m}`))})`);
        if (mc.length === 1) conditions.push(mc[0]);
        else conditions.push(Prisma.sql`(${Prisma.join(mc, " OR ")})`);
      }
    }
    if (params.company) {
      conditions.push(Prisma.sql`i."companyId" = ${params.company}`);
    }

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
        if (namedMarcas.length > 0) mc.push(Prisma.sql`marca IN (${Prisma.join(namedMarcas.map((m) => Prisma.sql`${m}`))})`);
        if (mc.length === 1) conditions.push(mc[0]);
        else conditions.push(Prisma.sql`(${Prisma.join(mc, " OR ")})`);
      }
    }
    if (params.company) {
      conditions.push(Prisma.sql`"companyId" = ${params.company}`);
    }

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

  // Fetch proformas and forecasts for the same date range
  const scenario = params.scenario === "optimistic" ? "optimistic" : "pessimistic";

  const [proformaRows, forecastRows] = await Promise.all([
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
      ${dateRange.lte ? (dateRange.gte ? Prisma.sql`AND month <= ${dateRange.lte}` : Prisma.sql`WHERE month <= ${dateRange.lte}`) : Prisma.empty}
      GROUP BY DATE_TRUNC('month', month), type
      ORDER BY month ASC
    `,
  ]);

  const pointMap = new Map<string, CashflowMonthlyPoint>();

  const ensurePoint = (d: Date): CashflowMonthlyPoint => {
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const monthLabel = d.toLocaleDateString("es-ES", { month: "short", year: "numeric" });
    if (!pointMap.has(monthKey)) {
      pointMap.set(monthKey, {
        monthKey, monthLabel,
        inflowsBase: 0, inflowsTax: 0, inflows: 0,
        outflowsBase: 0, outflowsTax: 0, outflows: 0,
        net: 0,
        forecastInflows: 0, forecastOutflows: 0,
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

type MonthInvoice = {
  id: string;
  holdedId: string;
  number: string | null;
  type: InvoiceType;
  counterparty: string | null;
  date: Date;
  totalEur: unknown;
  status: string;
  company: { name: string };
};

type MonthProforma = {
  id: string;
  holdedId: string;
  number: string | null;
  counterparty: string | null;
  date: Date;
  totalEur: unknown;
  company: { name: string };
};

type MonthDocument =
  | { kind: "invoice"; data: MonthInvoice }
  | { kind: "proforma"; data: MonthProforma };

async function getMonthInvoices(
  params: CashflowParams,
  monthKey: string
): Promise<MonthInvoice[]> {
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
  });
}

async function getMonthProformas(
  params: CashflowParams,
  monthKey: string
): Promise<MonthProforma[]> {
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

async function getCompanies(): Promise<{ id: string; name: string }[]> {
  return prisma.company.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

async function getAccounts(): Promise<{ num: string; name: string }[]> {
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

export default async function CashflowPage({
  searchParams,
}: {
  searchParams: Promise<CashflowParams>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;

  const l1List = params.l1?.split(",").filter(Boolean) ?? [];
  let effectiveParams = params;
  if (l1List.length > 0) {
    const mappings = await prisma.accountMapping.findMany({ where: { l1: { in: l1List } } });
    const l1Accounts = [...new Set(
      mappings.flatMap((m) => [m.accountNumSL, m.accountNumOU].filter(Boolean) as string[])
    )];
    const explicitAccounts = params.account?.split(",").filter(Boolean) ?? [];
    const resolvedAccounts = explicitAccounts.length > 0
      ? l1Accounts.filter((a) => explicitAccounts.includes(a))
      : l1Accounts;
    effectiveParams = { ...params, account: resolvedAccounts.join(",") || undefined };
  }

  const [{ monthly, kpis }, companies, accounts, monthInvoices, monthProformas] = await Promise.all([
    getCashflowData(effectiveParams),
    getCompanies(),
    getAccounts(),
    effectiveParams.selectedMonth ? getMonthInvoices(effectiveParams, effectiveParams.selectedMonth) : Promise.resolve(null),
    effectiveParams.selectedMonth ? getMonthProformas(effectiveParams, effectiveParams.selectedMonth) : Promise.resolve(null),
  ]);

  const monthDocuments: MonthDocument[] | null =
    monthInvoices !== null
      ? [
          ...monthInvoices.map((inv): MonthDocument => ({ kind: "invoice", data: inv })),
          ...(monthProformas ?? []).map((p): MonthDocument => ({ kind: "proforma", data: p })),
        ].sort((a, b) => a.data.date.getTime() - b.data.date.getTime())
      : null;

  const netIsPositive = kpis.netCashflow >= 0;

  const selectedMonthPoint = params.selectedMonth
    ? monthly.find((p) => p.monthKey === params.selectedMonth)
    : null;

  function buildUrl(overrides: Record<string, string | undefined>): string {
    const sp = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      period: params.period,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      marca: params.marca,
      company: params.company,
      account: params.account,
      l1: params.l1,
      selectedMonth: params.selectedMonth,
      ...overrides,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v) sp.set(k, v);
    }
    return `/cashflow?${sp.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Flujo de Caja</h1>
          <p className="text-sm text-gray-500 mt-1">Consolidado · en EUR</p>
        </div>
        <Suspense>
          <CashflowFilters companies={companies} accounts={accounts} />
        </Suspense>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Entradas totales</p>
          <p className="mt-2 text-2xl font-bold text-green-600">{formatCurrency(kpis.totalInflows)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Salidas totales</p>
          <p className="mt-2 text-2xl font-bold text-red-500">{formatCurrency(kpis.totalOutflows)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Flujo neto</p>
          <p className={`mt-2 text-2xl font-bold ${netIsPositive ? "text-indigo-600" : "text-red-600"}`}>
            {formatCurrency(kpis.netCashflow)}
          </p>
        </div>
      </div>

      {(kpis.totalForecastInflows > 0 || kpis.totalForecastOutflows > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-blue-50 rounded-xl border border-blue-200 p-5">
            <p className="text-xs font-medium text-blue-600 uppercase tracking-wide">
              Previsión entradas
              <span className="ml-1.5 font-normal capitalize">({params.scenario === "optimistic" ? "optimista" : "pesimista"})</span>
            </p>
            <p className="mt-2 text-xl font-bold text-blue-700">{formatCurrency(kpis.totalForecastInflows)}</p>
          </div>
          <div className="bg-blue-50 rounded-xl border border-blue-200 p-5">
            <p className="text-xs font-medium text-blue-600 uppercase tracking-wide">
              Previsión salidas
              <span className="ml-1.5 font-normal capitalize">({params.scenario === "optimistic" ? "optimista" : "pesimista"})</span>
            </p>
            <p className="mt-2 text-xl font-bold text-blue-700">{formatCurrency(kpis.totalForecastOutflows)}</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Entradas vs. Salidas por mes</h2>
        <Suspense>
          <CashflowChart data={monthly} />
        </Suspense>
      </div>

      {/* Month detail table */}
      {params.selectedMonth && monthDocuments && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
            <div>
              <h2 className="text-sm font-semibold text-gray-700">
                Documentos de {selectedMonthPoint?.monthLabel ?? params.selectedMonth}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {monthDocuments.length} documento{monthDocuments.length !== 1 ? "s" : ""}
                {selectedMonthPoint && (
                  <>
                    {" · "}
                    <span className="text-green-600">Entradas {formatCurrency(selectedMonthPoint.inflows)}</span>
                    {" · "}
                    <span className="text-red-500">Salidas {formatCurrency(selectedMonthPoint.outflows)}</span>
                    {" · "}
                    <span className={selectedMonthPoint.net >= 0 ? "text-indigo-600" : "text-red-600"}>
                      Neto {formatCurrency(selectedMonthPoint.net)}
                    </span>
                  </>
                )}
              </p>
            </div>
            <Link
              href={buildUrl({ selectedMonth: undefined })}
              className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors text-sm leading-none"
              title="Cerrar"
            >
              ✕
            </Link>
          </div>

          {monthDocuments.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-gray-400">
              No hay documentos con los filtros actuales para este mes.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Número</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Tipo</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Contraparte</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Empresa</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Fecha</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Total (EUR)</th>
                </tr>
              </thead>
              <tbody>
                {monthDocuments.map((doc) => {
                  const isProforma = doc.kind === "proforma";
                  const isInvoiceSale = doc.kind === "invoice" && doc.data.type === InvoiceType.SALE;
                  const href = isProforma
                    ? holdedProformaUrl(doc.data.holdedId)
                    : holdedInvoiceUrl(
                        doc.data.holdedId,
                        (doc.data as MonthInvoice).type
                      );
                  const tipoLabel = isProforma
                    ? "Proforma"
                    : isInvoiceSale
                    ? "Venta"
                    : "Compra";
                  const amountColor = isProforma
                    ? "text-blue-600"
                    : isInvoiceSale
                    ? "text-green-600"
                    : "text-red-600";

                  return (
                    <tr
                      key={`${doc.kind}-${doc.data.id}`}
                      className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">
                            {doc.data.number ?? (
                              <span className="italic text-gray-400 font-normal">Borrador</span>
                            )}
                          </span>
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-gray-400 hover:text-indigo-600 transition-colors"
                            title="Ver en Holded"
                          >
                            ↗
                          </a>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{tipoLabel}</td>
                      <td className="px-4 py-2.5 text-gray-600 max-w-[200px] truncate">
                        {doc.data.counterparty ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500">{doc.data.company.name}</td>
                      <td className="px-4 py-2.5 text-gray-500">{formatDate(doc.data.date.toISOString())}</td>
                      <td className={`px-4 py-2.5 text-right font-medium ${amountColor}`}>
                        {formatCurrency(Number(doc.data.totalEur))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
