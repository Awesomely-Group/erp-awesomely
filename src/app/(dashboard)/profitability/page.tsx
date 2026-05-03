import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";
import { InvoiceType } from "@prisma/client";
import { format } from "date-fns";
import { ProfitabilityFilters } from "./profitability-filters";

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
  // Get all classified invoices in the period with their classifications
  const invoices = await prisma.invoice.findMany({
    where: {
      date: { gte: from, lte: to },
      status: { in: ["CLASSIFIED", "APPROVED"] },
    },
    include: {
      lines: {
        include: {
          classification: {
            include: { project: { include: { workspace: true } } },
          },
        },
      },
    },
  });

  const projectMap = new Map<
    string,
    { project: { name: string; workspaceName: string }; revenue: number; costs: number }
  >();

  for (const invoice of invoices) {
    const classifiedLines = invoice.lines.filter((l) => l.classification !== null);
    if (classifiedLines.length === 0) continue;

    // Each invoice's total is split proportionally among its classified lines by their subtotal
    const classifiedSubtotalSum = classifiedLines.reduce(
      (sum, l) => sum + Number(l.subtotal),
      0
    );
    const invoiceTotal = Number(invoice.totalEur);

    for (const line of classifiedLines) {
      const classification = line.classification!;
      if (!classification.project && !classification.projectId) continue;

      const projectId = classification.projectId ?? "awesomely";

      // Line's share of the invoice total, proportional to its subtotal
      const lineShare =
        classifiedSubtotalSum !== 0
          ? (Number(line.subtotal) / classifiedSubtotalSum) * invoiceTotal
          : invoiceTotal / classifiedLines.length;

      const existing = projectMap.get(projectId) ?? {
        project: {
          name: classification.project?.name ?? "Awesomely",
          workspaceName: classification.project?.workspace.name ?? "Awesomely",
        },
        revenue: 0,
        costs: 0,
      };

      if (invoice.type === InvoiceType.SALE) {
        existing.revenue += lineShare;
      } else {
        existing.costs += lineShare;
      }

      projectMap.set(projectId, existing);
    }
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
  } else if (params.period === "year") {
    from = new Date(currentYear, 0, 1);
    to = new Date(currentYear, 11, 31);
  } else {
    // Default: current quarter
    const q = Math.floor(currentMonth / 3);
    from = new Date(currentYear, q * 3, 1);
    to = new Date(currentYear, q * 3 + 3, 0);
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
    : params.from
      ? `${params.from} — ${params.to}`
      : `Q${Math.floor(currentMonth / 3) + 1} ${currentYear}`;

  const fromStr = format(from, "yyyy-MM-dd");
  const toStr = format(to, "yyyy-MM-dd");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rentabilidad</h1>
          <p className="text-sm text-gray-500 mt-1">{periodLabel}</p>
        </div>

        <ProfitabilityFilters from={fromStr} to={toStr} />
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
