import { Suspense } from "react";
import { getPlData, getPlYears } from "@/lib/pl-data";
import type { PlParams } from "@/lib/pl-data";
import { PlTable } from "./pl-client";
import { PlFilters } from "./pl-filters";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

export default async function PlPage({
  searchParams,
}: {
  searchParams: Promise<PlParams & { entity?: string }>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const [plData, years] = await Promise.all([getPlData(params), getPlYears()]);

  const displayYears = years.length > 0 ? years : [new Date().getFullYear()];
  const { year, entities, consolidated, l1Categories } = plData;

  const entityParam = params.entity ?? "consolidated";
  const activeEntity =
    entityParam !== "consolidated"
      ? (entities.find((e) => e.companyId === entityParam) ?? consolidated)
      : consolidated;

  const netIsPositive = activeEntity.yearly.result >= 0;
  const margin =
    activeEntity.yearly.revenue > 0
      ? (activeEntity.yearly.result / activeEntity.yearly.revenue) * 100
      : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">P&L</h1>
          <p className="text-sm text-gray-500 mt-1">
            {activeEntity.companyName} · {year} · en EUR (base imponible)
          </p>
        </div>
        <Suspense>
          <PlFilters
            years={displayYears}
            entities={entities.map((e) => ({ companyId: e.companyId, companyName: e.companyName }))}
            currentYear={year}
            currentEntity={entityParam}
          />
        </Suspense>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Ingresos</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{formatCurrency(activeEntity.yearly.revenue)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Gastos</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{formatCurrency(activeEntity.yearly.totalExpenses)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Resultado</p>
          <p className={cn("mt-2 text-2xl font-bold", netIsPositive ? "text-green-600" : "text-red-500")}>
            {formatCurrency(activeEntity.yearly.result)}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Margen</p>
          <p className={cn("mt-2 text-2xl font-bold", margin !== null && margin >= 0 ? "text-indigo-600" : "text-red-500")}>
            {margin !== null ? `${margin.toFixed(1)}%` : "—"}
          </p>
        </div>
      </div>

      {/* Tabla full-width */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {activeEntity.yearly.revenue === 0 && activeEntity.yearly.totalExpenses === 0 ? (
          <p className="px-6 py-16 text-center text-sm text-gray-400">
            No hay datos para {activeEntity.companyName} en {year}.
          </p>
        ) : (
          <PlTable entity={activeEntity} l1Categories={l1Categories} />
        )}
      </div>
    </div>
  );
}
