import { Suspense } from "react";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";
import { getDateRange } from "@/lib/date-range";
import { MARCA_FILTER_UNASSIGNED } from "@/lib/org";
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
    // Line-level query when filtering by accounting account(s)
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
    // Invoice-level query (no account filter)
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

async function getCompanies(): Promise<{ id: string; name: string }[]> {
  return prisma.company.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

async function getAccounts(): Promise<{ num: string; name: string | null }[]> {
  const rows = await prisma.invoiceLine.findMany({
    where: { accountingAccount: { not: null } },
    select: { accountingAccount: true, accountingAccountName: true },
    distinct: ["accountingAccount"],
    orderBy: { accountingAccount: "asc" },
  });
  return rows.map((r) => ({ num: r.accountingAccount!, name: r.accountingAccountName }));
}

export default async function CashflowPage({
  searchParams,
}: {
  searchParams: Promise<CashflowParams>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;

  const [{ monthly, kpis }, companies, accounts] = await Promise.all([
    getCashflowData(params),
    getCompanies(),
    getAccounts(),
  ]);

  const netIsPositive = kpis.netCashflow >= 0;

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
        <CashflowChart data={monthly} />
      </div>
    </div>
  );
}
