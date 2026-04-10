import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";
import { getDateRange } from "@/lib/date-range";
import { invoiceWhereMarca, MARCA_FILTER_UNASSIGNED } from "@/lib/org";
import { InvoiceStatus, Prisma, type Prisma as PrismaTypes } from "@prisma/client";
import { DashboardFilters } from "./dashboard-filters";
import { Suspense } from "react";
import { CashflowChart, type CashflowMonthlyPoint } from "@/app/(dashboard)/cashflow/cashflow-chart";

type DashboardParams = {
  period?: string;
  dateFrom?: string;
  dateTo?: string;
  marca?: string;
};

function buildDashboardInvoiceWhere(
  params: DashboardParams
): Prisma.InvoiceWhereInput {
  const dateRange = getDateRange(
    params.period ?? "",
    params.dateFrom,
    params.dateTo
  );
  const where: Prisma.InvoiceWhereInput = {};
  if (dateRange.gte || dateRange.lte) {
    where.date = dateRange;
  }
  const marcaFilter = invoiceWhereMarca(params.marca);
  if (marcaFilter) Object.assign(where, marcaFilter);
  return where;
}

type RawMonthlyRow = {
  month: Date;
  invoice_type: string;
  total_eur: unknown;
};

async function getDashboardCashflow(
  params: DashboardParams
): Promise<CashflowMonthlyPoint[]> {
  const dateRange = getDateRange(
    params.period ?? "",
    params.dateFrom,
    params.dateTo
  );
  const conditions: Prisma.Sql[] = [];

  if (dateRange.gte) conditions.push(Prisma.sql`date >= ${dateRange.gte}`);
  if (dateRange.lte) conditions.push(Prisma.sql`date <= ${dateRange.lte}`);

  if (params.marca === MARCA_FILTER_UNASSIGNED) {
    conditions.push(Prisma.sql`marca IS NULL`);
  } else if (params.marca) {
    conditions.push(Prisma.sql`marca = ${params.marca}`);
  }

  const whereClause =
    conditions.length > 0
      ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`
      : Prisma.empty;

  const rows = await prisma.$queryRaw<RawMonthlyRow[]>`
    SELECT
      DATE_TRUNC('month', date) AS month,
      type AS invoice_type,
      SUM("totalEur") AS total_eur
    FROM invoices
    ${whereClause}
    GROUP BY DATE_TRUNC('month', date), type
    ORDER BY month ASC
  `;

  const pointMap = new Map<string, CashflowMonthlyPoint>();
  for (const row of rows) {
    const d = new Date(row.month);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const monthLabel = d.toLocaleDateString("es-ES", {
      month: "short",
      year: "numeric",
    });
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

  return Array.from(pointMap.values());
}

async function getDashboardStats(where: PrismaTypes.InvoiceWhereInput = {}) {
  const pendingWhere: Prisma.InvoiceWhereInput = {
    ...where,
    status: { in: [InvoiceStatus.PENDING, InvoiceStatus.PARTIAL] },
  };
  const saleWhere: Prisma.InvoiceWhereInput = { ...where, type: "SALE" };
  const purchaseWhere: Prisma.InvoiceWhereInput = { ...where, type: "PURCHASE" };

  const [totalInvoices, pendingClassification, totalSaleEur, totalPurchaseEur] =
    await Promise.all([
      prisma.invoice.count({ where }),
      prisma.invoice.count({ where: pendingWhere }),
      prisma.invoice.aggregate({
        _sum: { totalEur: true },
        where: saleWhere,
      }),
      prisma.invoice.aggregate({
        _sum: { totalEur: true },
        where: purchaseWhere,
      }),
    ]);

  const revenue = Number(totalSaleEur._sum.totalEur ?? 0);
  const costs = Number(totalPurchaseEur._sum.totalEur ?? 0);

  return {
    totalInvoices,
    pendingClassification,
    revenue,
    costs,
    margin: revenue - costs,
  };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<DashboardParams>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const invoiceWhere = buildDashboardInvoiceWhere(params);

  const [session, stats, cashflowMonthly] = await Promise.all([
    auth(),
    getDashboardStats(invoiceWhere),
    getDashboardCashflow(params),
  ]);

  const hasFilters = Boolean(
    params.period ||
      params.dateFrom ||
      params.dateTo ||
      params.marca
  );

  const cards = [
    {
      label: "Ingresos totales",
      value: formatCurrency(stats.revenue),
      color: "text-green-600",
      bg: "bg-green-50",
    },
    {
      label: "Gastos totales",
      value: formatCurrency(stats.costs),
      color: "text-red-600",
      bg: "bg-red-50",
    },
    {
      label: "Margen bruto",
      value: formatCurrency(stats.margin),
      color: stats.margin >= 0 ? "text-indigo-600" : "text-red-600",
      bg: stats.margin >= 0 ? "bg-indigo-50" : "bg-red-50",
    },
    {
      label: "Facturas sin clasificar",
      value: stats.pendingClassification.toString(),
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Bienvenido, {session?.user?.name?.split(" ")[0]}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Resumen global del grupo Awesomely
          {hasFilters && (
            <span className="text-indigo-600 font-medium">
              {" "}
              · cifras filtradas
            </span>
          )}
        </p>
      </div>

      <Suspense fallback={null}>
        <DashboardFilters />
      </Suspense>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="bg-white rounded-xl border border-gray-200 p-6 space-y-2"
          >
            <p className="text-sm text-gray-500">{card.label}</p>
            <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          Flujo de caja mensual
        </h2>
        <CashflowChart data={cashflowMonthly} height={260} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          Estado del sistema
        </h2>
        <div className="space-y-3">
          <StatusRow
            label="Total facturas (según filtros)"
            value={stats.totalInvoices.toString()}
          />
          <StatusRow
            label="Facturas pendientes de clasificar"
            value={stats.pendingClassification.toString()}
            badge="warning"
          />
        </div>
      </div>
    </div>
  );
}

function StatusRow({
  label,
  value,
  badge,
}: {
  label: string;
  value: string;
  badge?: "warning" | "ok";
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-600">{label}</span>
      <span
        className={`text-sm font-medium px-2 py-0.5 rounded-full ${
          badge === "warning"
            ? "bg-amber-100 text-amber-700"
            : badge === "ok"
              ? "bg-green-100 text-green-700"
              : "text-gray-900"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
