import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";
import { getDateRange } from "@/lib/date-range";
import { invoiceWhereMarca, MARCA_FILTER_UNASSIGNED, STATUS_FILTER_UNASSIGNED } from "@/lib/org";
import { InvoiceStatus, Prisma, type Prisma as PrismaTypes } from "@prisma/client";
import { DashboardFilters } from "./dashboard-filters";
import { Suspense } from "react";
import { CashflowChart } from "@/app/(dashboard)/cashflow/cashflow-chart";
import type { CashflowMonthlyPoint } from "@/lib/cashflow-data";

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
  const where: Prisma.InvoiceWhereInput = { removedFromHoldedAt: null };
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
  subtotal_eur: unknown;
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
  const conditions: Prisma.Sql[] = [Prisma.sql`"removedFromHoldedAt" IS NULL`];

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
      DATE_TRUNC('month', date)       AS month,
      type                            AS invoice_type,
      SUM(subtotal * "fxRateToEur")   AS subtotal_eur,
      SUM("totalEur")                 AS total_eur
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
      pointMap.set(monthKey, {
        monthKey, monthLabel,
        inflowsBase: 0, inflowsTax: 0, inflows: 0,
        outflowsBase: 0, outflowsTax: 0, outflows: 0,
        net: 0,
        committedInflows: 0, estimatedInflows: 0, estimatedOutflows: 0,
        trendInflows: 0, trendOutflows: 0,
      });
    }
    const point = pointMap.get(monthKey)!;
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

  return Array.from(pointMap.values());
}

/** Estado de Holded "pendiente de cobro/pago" — el mismo valor que usa el filtro Pago/Cobro de /invoices. */
const HOLDED_STATUS_PENDING = 1;

async function getAlerts() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const fourteenDaysLater = new Date(now);
  fourteenDaysLater.setDate(fourteenDaysLater.getDate() + 14);

  // Pendiente de cobro/pago es el estado que trae Holded (1 = pendiente), NO el estado
  // de clasificación del ERP. Hasta ahora estas alertas miraban `status`, que es la
  // clasificación: la fila "Pagos pendientes atrasados" contaba en realidad compras sin
  // clasificar emitidas hace más de 30 días — 1, cuando lo pendiente de pago eran 38.
  const pendingPayment = { removedFromHoldedAt: null, holdedStatus: HOLDED_STATUS_PENDING };

  const [
    unclassified,
    pendingCollection,
    overdueCollection,
    pendingPaymentAgg,
    overduePayment,
    proformasDueSoon,
    proformasOverdue,
  ] = await Promise.all([
    prisma.invoice.count({
      where: { removedFromHoldedAt: null, status: { in: [InvoiceStatus.PENDING, InvoiceStatus.PARTIAL] } },
    }),
    prisma.invoice.aggregate({
      where: { ...pendingPayment, type: "SALE" },
      _count: true,
      _sum: { totalEur: true },
    }),
    prisma.invoice.aggregate({
      // Vencidas: se mide contra la fecha de vencimiento, no la de emisión.
      where: { ...pendingPayment, type: "SALE", dueDate: { lt: thirtyDaysAgo } },
      _count: true,
      _sum: { totalEur: true },
    }),
    prisma.invoice.aggregate({
      where: { ...pendingPayment, type: "PURCHASE" },
      _count: true,
      _sum: { totalEur: true },
    }),
    prisma.invoice.aggregate({
      where: { ...pendingPayment, type: "PURCHASE", dueDate: { lt: thirtyDaysAgo } },
      _count: true,
      _sum: { totalEur: true },
    }),
    prisma.proforma.count({
      // Exclude converted (3) and cancelled (-1) — a proforma already invoiced or
      // cancelled shouldn't count as "pending" here (aligns with /proformas and the
      // notify/proformas cron, which already exclude them).
      where: { dueDate: { gte: now, lte: fourteenDaysLater }, holdedStatus: { in: [0, 1, 4] } },
    }),
    prisma.proforma.count({
      where: { dueDate: { lt: now }, holdedStatus: { in: [0, 1, 4] } },
    }),
  ]);

  const agg = (r: { _count: number; _sum: { totalEur: unknown } }) => ({
    count: r._count,
    total: Number(r._sum.totalEur ?? 0),
  });

  return {
    unclassified,
    pendingCollection: agg(pendingCollection),
    overdueCollection: agg(overdueCollection),
    pendingPayment: agg(pendingPaymentAgg),
    overduePayment: agg(overduePayment),
    // Las alertas de vencidas filtran por vencimiento, y eso no se puede expresar con
    // los filtros visibles de /invoices: el enlace lleva `dueBefore` para que la lista
    // enseñe exactamente las mismas facturas que ha contado la alerta.
    overdueBefore: thirtyDaysAgo.toISOString().slice(0, 10),
    proformasDueSoon,
    proformasOverdue,
  };
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

  const [session, stats, cashflowMonthly, alerts] = await Promise.all([
    auth(),
    getDashboardStats(invoiceWhere),
    getDashboardCashflow(params),
    getAlerts(),
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
      <div className="flex items-start justify-between gap-4 flex-wrap">
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
      </div>

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
        <CashflowChart data={cashflowMonthly} height={260} showForecast={false} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          Alertas operativas
        </h2>
        <div className="space-y-2">
          <AlertRow
            label="Facturas sin clasificar"
            count={alerts.unclassified}
            // "Sin asignar" = PENDING + PARTIAL, que es justo lo que cuenta la alerta.
            // El enlace anterior filtraba solo PENDING y enseñaba menos de las que decía.
            href={`/invoices?status=${STATUS_FILTER_UNASSIGNED}`}
            severity={alerts.unclassified > 0 ? "warning" : "ok"}
          />
          <AlertRow
            label="Cobros pendientes"
            count={alerts.pendingCollection.count}
            amount={alerts.pendingCollection.total}
            href={`/invoices?type=SALE&holdedStatus=${HOLDED_STATUS_PENDING}`}
            severity={alerts.pendingCollection.count > 0 ? "warning" : "ok"}
          />
          <AlertRow
            label="Cobros vencidos (+30 días)"
            count={alerts.overdueCollection.count}
            amount={alerts.overdueCollection.total}
            href={`/invoices?type=SALE&holdedStatus=${HOLDED_STATUS_PENDING}&dueBefore=${alerts.overdueBefore}`}
            severity={alerts.overdueCollection.count > 0 ? "error" : "ok"}
          />
          <AlertRow
            label="Pagos pendientes"
            count={alerts.pendingPayment.count}
            amount={alerts.pendingPayment.total}
            href={`/invoices?type=PURCHASE&holdedStatus=${HOLDED_STATUS_PENDING}`}
            severity={alerts.pendingPayment.count > 0 ? "warning" : "ok"}
          />
          <AlertRow
            label="Pagos vencidos (+30 días)"
            count={alerts.overduePayment.count}
            amount={alerts.overduePayment.total}
            href={`/invoices?type=PURCHASE&holdedStatus=${HOLDED_STATUS_PENDING}&dueBefore=${alerts.overdueBefore}`}
            severity={alerts.overduePayment.count > 0 ? "error" : "ok"}
          />
          <AlertRow
            label="Proformas vencidas sin emitir"
            count={alerts.proformasOverdue}
            href="/proformas"
            severity={alerts.proformasOverdue > 0 ? "error" : "ok"}
          />
          <AlertRow
            label="Proformas a emitir en los próximos 14 días"
            count={alerts.proformasDueSoon}
            href="/proformas"
            severity={alerts.proformasDueSoon > 0 ? "warning" : "ok"}
          />
        </div>
      </div>
    </div>
  );
}

function AlertRow({
  label,
  count,
  amount,
  href,
  severity,
}: {
  label: string;
  count: number;
  amount?: number;
  href: string;
  severity: "ok" | "warning" | "error";
}): React.JSX.Element {
  const colors = {
    ok: "bg-green-50 text-green-700",
    warning: "bg-amber-100 text-amber-700",
    error: "bg-red-100 text-red-700",
  };
  const dot = {
    ok: "bg-green-400",
    warning: "bg-amber-400",
    error: "bg-red-500",
  };

  return (
    <a
      href={href}
      className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-gray-50 transition-colors border border-gray-100 group"
    >
      <div className="flex items-center gap-2.5">
        <span className={`h-2 w-2 rounded-full flex-shrink-0 ${dot[severity]}`} />
        <span className="text-sm text-gray-700 group-hover:text-gray-900">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {amount != null && amount > 0 && (
          <span className="text-xs text-gray-400">{formatCurrency(amount)}</span>
        )}
        <span className={`text-sm font-semibold px-2 py-0.5 rounded-full ${colors[severity]}`}>
          {count}
        </span>
      </div>
    </a>
  );
}
