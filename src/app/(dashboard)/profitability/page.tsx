import { formatCurrency } from "@/lib/utils";
import { getProfitabilityData } from "@/lib/profitability";
import { format } from "date-fns";
import { ProfitabilityFilters } from "./profitability-filters";
import { ProfitabilityTable } from "./profitability-table";

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

  const periodLabel =
    params.period === "year"
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

      <ProfitabilityTable rows={rows} />
    </div>
  );
}
