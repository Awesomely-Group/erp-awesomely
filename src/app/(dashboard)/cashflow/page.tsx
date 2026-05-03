import { Suspense } from "react";
import { Prisma, InvoiceType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate, holdedInvoiceUrl } from "@/lib/utils";
import { getDateRange } from "@/lib/date-range";
import { MARCA_FILTER_UNASSIGNED } from "@/lib/org";
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
  type?: string;
  account?: string;
  selectedMonth?: string;
};

type CashflowKpis = {
  totalInflows: number;
  totalOutflows: number;
  netCashflow: number;
  monthCount: number;
};

type RawMonthlyRow = {
  month: Date;
  invoice_type: string;
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
    if (params.marca === MARCA_FILTER_UNASSIGNED) {
      conditions.push(Prisma.sql`i.marca IS NULL`);
    } else if (params.marca) {
      conditions.push(Prisma.sql`i.marca = ${params.marca}`);
    }
    if (params.company) {
      conditions.push(Prisma.sql`i."companyId" = ${params.company}`);
    }

    const where = Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;

    rows = await prisma.$queryRaw<RawMonthlyRow[]>`
      SELECT
        DATE_TRUNC('month', i.date) AS month,
        i.type                      AS invoice_type,
        SUM(il."totalEur")          AS total_eur
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
    if (params.marca === MARCA_FILTER_UNASSIGNED) {
      conditions.push(Prisma.sql`marca IS NULL`);
    } else if (params.marca) {
      conditions.push(Prisma.sql`marca = ${params.marca}`);
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
        DATE_TRUNC('month', date) AS month,
        type                      AS invoice_type,
        SUM("totalEur")           AS total_eur
      FROM invoices
      ${where}
      GROUP BY DATE_TRUNC('month', date), type
      ORDER BY month ASC
    `;
  }

  const pointMap = new Map<string, CashflowMonthlyPoint>();

  for (const row of rows) {
    if (params.type === "SALE" && row.invoice_type !== "SALE") continue;
    if (params.type === "PURCHASE" && row.invoice_type !== "PURCHASE") continue;

    const d = new Date(row.month);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const monthLabel = d.toLocaleDateString("es-ES", { month: "short", year: "numeric" });

    if (!pointMap.has(monthKey)) {
      pointMap.set(monthKey, { monthKey, monthLabel, inflows: 0, outflows: 0, net: 0 });
    }

    const point = pointMap.get(monthKey)!;
    const amount = Number(row.total_eur);

    if (row.invoice_type === "SALE") {
      point.inflows += amount;
    } else {
      point.outflows += amount;
    }
    point.net = point.inflows - point.outflows;
  }

  const monthly = Array.from(pointMap.values());
  const kpis: CashflowKpis = {
    totalInflows: monthly.reduce((s, p) => s + p.inflows, 0),
    totalOutflows: monthly.reduce((s, p) => s + p.outflows, 0),
    netCashflow: monthly.reduce((s, p) => s + p.net, 0),
    monthCount: monthly.length,
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

  const where = {
    date: { gte: from, lte: to },
    ...(params.type ? { type: params.type as InvoiceType } : {}),
    ...(params.marca === MARCA_FILTER_UNASSIGNED
      ? { marca: null }
      : params.marca
        ? { marca: params.marca }
        : {}),
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

  const [{ monthly, kpis }, companies, accounts, monthInvoices] = await Promise.all([
    getCashflowData(params),
    getCompanies(),
    getAccounts(),
    params.selectedMonth ? getMonthInvoices(params, params.selectedMonth) : Promise.resolve(null),
  ]);

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
      type: params.type,
      account: params.account,
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
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Flujo de Caja</h1>
        <p className="text-sm text-gray-500 mt-1">Consolidado · en EUR</p>
      </div>

      <Suspense>
        <CashflowFilters companies={companies} accounts={accounts} />
      </Suspense>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
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
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Meses analizados</p>
          <p className="mt-2 text-2xl font-bold text-gray-700">{kpis.monthCount}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Entradas vs. Salidas por mes</h2>
        <Suspense>
          <CashflowChart data={monthly} />
        </Suspense>
      </div>

      {/* Month detail table */}
      {params.selectedMonth && monthInvoices && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
            <div>
              <h2 className="text-sm font-semibold text-gray-700">
                Facturas de {selectedMonthPoint?.monthLabel ?? params.selectedMonth}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {monthInvoices.length} factura{monthInvoices.length !== 1 ? "s" : ""}
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

          {monthInvoices.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-gray-400">
              No hay facturas con los filtros actuales para este mes.
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
                {monthInvoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">
                          {inv.number ?? (
                            <span className="italic text-gray-400 font-normal">Borrador</span>
                          )}
                        </span>
                        <a
                          href={holdedInvoiceUrl(inv.holdedId, inv.type)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-gray-400 hover:text-indigo-600 transition-colors"
                          title="Ver en Holded"
                        >
                          ↗
                        </a>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">
                      {inv.type === InvoiceType.SALE ? "Venta" : "Compra"}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 max-w-[200px] truncate">
                      {inv.counterparty ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500">{inv.company.name}</td>
                    <td className="px-4 py-2.5 text-gray-500">{formatDate(inv.date.toISOString())}</td>
                    <td
                      className={`px-4 py-2.5 text-right font-medium ${
                        inv.type === InvoiceType.SALE ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {formatCurrency(Number(inv.totalEur))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
