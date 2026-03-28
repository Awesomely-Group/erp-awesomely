import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";
import { InvoiceStatus } from "@prisma/client";

async function getDashboardStats() {
  const [
    totalInvoices,
    pendingClassification,
    totalSaleEur,
    totalPurchaseEur,
  ] = await Promise.all([
    prisma.invoice.count(),
    prisma.invoice.count({
      where: { status: { in: [InvoiceStatus.PENDING, InvoiceStatus.PARTIAL] } },
    }),
    prisma.invoice.aggregate({
      _sum: { totalEur: true },
      where: { type: "SALE" },
    }),
    prisma.invoice.aggregate({
      _sum: { totalEur: true },
      where: { type: "PURCHASE" },
    }),
  ]);

  const revenue = Number(totalSaleEur._sum.totalEur ?? 0);
  const costs = Number(totalPurchaseEur._sum.totalEur ?? 0);

  return { totalInvoices, pendingClassification, revenue, costs, margin: revenue - costs };
}

export default async function DashboardPage(): Promise<React.JSX.Element> {
  const session = await auth();
  const stats = await getDashboardStats();

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
        </p>
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
          Estado del sistema
        </h2>
        <div className="space-y-3">
          <StatusRow label="Total facturas importadas" value={stats.totalInvoices.toString()} />
          <StatusRow label="Facturas pendientes de clasificar" value={stats.pendingClassification.toString()} badge="warning" />
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
