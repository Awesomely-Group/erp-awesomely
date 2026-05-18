import { Suspense } from "react";
import { formatCurrency } from "@/lib/utils";
import { getProjectionData } from "@/lib/projection-data";
import type { ProjectionParams, HorizonKpi } from "@/lib/projection-data";
import { ProjectionChart } from "./projection-chart";
import { ProjectionFilters } from "./projection-filters";

function HorizonCard({ horizon }: { horizon: HorizonKpi }): React.JSX.Element {
  const isPositive = horizon.baselineNet >= 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {horizon.months} meses vista
      </p>
      <p className={`text-2xl font-bold ${isPositive ? "text-indigo-600" : "text-red-600"}`}>
        {formatCurrency(horizon.baselineNet)}
      </p>
      <div className="space-y-1 text-sm">
        <p className="text-green-600 font-medium">
          Optimista: {formatCurrency(horizon.optimisticNet)}
        </p>
        <p className="text-amber-600 font-medium">
          Pesimista: {formatCurrency(horizon.pessimisticNet)}
        </p>
      </div>
      <div className="pt-1 border-t border-gray-100 text-xs text-gray-400 space-y-0.5">
        <p>~Entradas: {formatCurrency(horizon.baselineInflows)}</p>
        <p>~Salidas: {formatCurrency(horizon.baselineOutflows)}</p>
      </div>
    </div>
  );
}

export default async function ProyeccionesPage({
  searchParams,
}: {
  searchParams: Promise<ProjectionParams>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const { projections, horizons, avgInflows, avgOutflows, windowMonths } =
    await getProjectionData(params);

  const marginPct = Math.min(
    Math.max(isNaN(parseInt(params.margin ?? "20", 10)) ? 20 : parseInt(params.margin ?? "20", 10), 0),
    50
  );

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Proyecciones</h1>
          <p className="text-sm text-gray-500 mt-1">
            Estimaciones automáticas basadas en histórico · en EUR
          </p>
        </div>
        <Suspense fallback={null}>
          <ProjectionFilters />
        </Suspense>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {horizons.map((h) => (
          <HorizonCard key={h.months} horizon={h} />
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          Proyección mensual a 12 meses
        </h2>
        <ProjectionChart data={projections} />
      </div>

      <p className="text-xs text-gray-400">
        Base calculada con los últimos {windowMonths} {windowMonths === 1 ? "mes" : "meses"} de datos
        reales — promedio mensual de entradas{" "}
        <span className="font-medium">{formatCurrency(avgInflows)}</span> y salidas{" "}
        <span className="font-medium">{formatCurrency(avgOutflows)}</span>. Margen aplicado:{" "}
        <span className="font-medium">±{marginPct}%</span>.
      </p>
    </div>
  );
}
