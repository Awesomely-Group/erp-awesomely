import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";
import { InvoiceType } from "@prisma/client";

interface ProfitabilityRow {
  projectId: string;
  projectName: string;
  workspaceName: string;
  revenue: number;
  costs: number;
  margin: number;
  marginPct: number;
}

async function getProfitabilityData(
  from: Date,
  to: Date
): Promise<ProfitabilityRow[]> {
  const classifications = await prisma.classification.findMany({
    where: {
      invoiceLine: {
        invoice: {
          date: { gte: from, lte: to },
          status: { in: ["CLASSIFIED", "REVIEWED", "APPROVED"] },
        },
      },
    },
    include: {
      project: { include: { workspace: true } },
      invoiceLine: {
        include: { invoice: true },
      },
    },
  });

  const projectMap = new Map<
    string,
    { project: { name: string; workspaceName: string }; revenue: number; costs: number }
  >();

  for (const c of classifications) {
    const existing = projectMap.get(c.projectId) ?? {
      project: {
        name: c.project.name,
        workspaceName: c.project.workspace.name,
      },
      revenue: 0,
      costs: 0,
    };

    const amount = Number(c.invoiceLine.totalEur);

    if (c.invoiceLine.invoice.type === InvoiceType.SALE) {
      existing.revenue += amount;
    } else {
      existing.costs += amount;
    }

    projectMap.set(c.projectId, existing);
  }

  return Array.from(projectMap.entries())
    .map(([projectId, data]) => {
      const margin = data.revenue - data.costs;
      const marginPct = data.revenue > 0 ? (margin / data.revenue) * 100 : 0;
      return {
        projectId,
        projectName: data.project.name,
        workspaceName: data.project.workspaceName,
        revenue: data.revenue,
        costs: data.costs,
        margin,
        marginPct,
      };
    })
    .sort((a, b) => b.margin - a.margin);
}

export default async function ProfitabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; period?: string }>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  let from: Date;
  let to: Date;

  if (params.from && params.to) {
    from = new Date(params.from);
    to = new Date(params.to);
  } else if (params.period === "quarter") {
    const q = Math.floor(currentMonth / 3);
    from = new Date(currentYear, q * 3, 1);
    to = new Date(currentYear, q * 3 + 3, 0);
  } else if (params.period === "year") {
    from = new Date(currentYear, 0, 1);
    to = new Date(currentYear, 11, 31);
  } else {
    // Default: current month
    from = new Date(currentYear, currentMonth, 1);
    to = new Date(currentYear, currentMonth + 1, 0);
  }

  const rows = await getProfitabilityData(from, to);

  const totals = rows.reduce(
    (acc, r) => ({
      revenue: acc.revenue + r.revenue,
      costs: acc.costs + r.costs,
      margin: acc.margin + r.margin,
    }),
    { revenue: 0, costs: 0, margin: 0 }
  );

  const periodLabel = params.period === "year"
    ? `Año ${currentYear}`
    : params.period === "quarter"
      ? `Q${Math.floor(currentMonth / 3) + 1} ${currentYear}`
      : params.from
        ? `${params.from} — ${params.to}`
        : `${new Date(from).toLocaleDateString("es-ES", { month: "long", year: "numeric" })}`;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rentabilidad</h1>
          <p className="text-sm text-gray-500 mt-1">{periodLabel}</p>
        </div>

        {/* Period selector */}
        <form className="flex flex-wrap gap-2">
          <a
            href="/profitability?period=month"
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Este mes
          </a>
          <a
            href="/profitability?period=quarter"
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Este trimestre
          </a>
          <a
            href="/profitability?period=year"
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Este año
          </a>
          <div className="flex gap-2 items-center">
            <input
              type="date"
              name="from"
              defaultValue={params.from}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm bg-white"
            />
            <span className="text-gray-400">—</span>
            <input
              type="date"
              name="to"
              defaultValue={params.to}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm bg-white"
            />
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              Aplicar
            </button>
          </div>
        </form>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500">Ingresos totales</p>
          <p className="text-2xl font-bold text-green-600 mt-1">
            {formatCurrency(totals.revenue)}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500">Gastos totales</p>
          <p className="text-2xl font-bold text-red-600 mt-1">
            {formatCurrency(totals.costs)}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500">Margen bruto</p>
          <p
            className={`text-2xl font-bold mt-1 ${
              totals.margin >= 0 ? "text-indigo-600" : "text-red-600"
            }`}
          >
            {formatCurrency(totals.margin)}
          </p>
          {totals.revenue > 0 && (
            <p className="text-sm text-gray-400 mt-0.5">
              {((totals.margin / totals.revenue) * 100).toFixed(1)}% sobre ingresos
            </p>
          )}
        </div>
      </div>

      {/* Project table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-3 text-left font-medium text-gray-600">Proyecto</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Workspace</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">Ingresos</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">Gastos</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">Margen</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.projectId}
                className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors"
              >
                <td className="px-4 py-3 font-medium text-gray-900">{row.projectName}</td>
                <td className="px-4 py-3 text-gray-500">{row.workspaceName}</td>
                <td className="px-4 py-3 text-right text-green-600">
                  {formatCurrency(row.revenue)}
                </td>
                <td className="px-4 py-3 text-right text-red-600">
                  {formatCurrency(row.costs)}
                </td>
                <td
                  className={`px-4 py-3 text-right font-medium ${
                    row.margin >= 0 ? "text-indigo-600" : "text-red-600"
                  }`}
                >
                  {formatCurrency(row.margin)}
                </td>
                <td className="px-4 py-3 text-right">
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      row.marginPct >= 20
                        ? "bg-green-100 text-green-700"
                        : row.marginPct >= 0
                          ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-700"
                    }`}
                  >
                    {row.marginPct.toFixed(1)}%
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                  No hay datos clasificados para este período
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
