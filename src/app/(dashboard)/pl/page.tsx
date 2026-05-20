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
  const { year, entities, consolidated } = plData;

  const entityParam  = params.entity ?? "consolidated";
  const activeEntity =
    entityParam !== "consolidated"
      ? (entities.find((e) => e.companyId === entityParam) ?? consolidated)
      : consolidated;

  const yearly = activeEntity.yearly;

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
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Ventas</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{formatCurrency(yearly.ventas)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Margen Bruto</p>
          <p className={cn("mt-2 text-2xl font-bold", yearly.margen_bruto >= 0 ? "text-gray-900" : "text-red-500")}>
            {formatCurrency(yearly.margen_bruto)}
          </p>
          {yearly.ventas > 0 && (
            <p className="mt-1 text-xs text-gray-400">
              {((yearly.margen_bruto / yearly.ventas) * 100).toFixed(1)}% s/ventas
            </p>
          )}
        </div>
        <div className="bg-indigo-800 rounded-xl p-5">
          <p className="text-xs font-medium text-indigo-200 uppercase tracking-wide">EBITDA</p>
          <p className={cn("mt-2 text-2xl font-bold", yearly.ebitda >= 0 ? "text-white" : "text-red-300")}>
            {formatCurrency(yearly.ebitda)}
          </p>
          {yearly.ventas > 0 && (
            <p className="mt-1 text-xs text-indigo-300">
              {((yearly.ebitda / yearly.ventas) * 100).toFixed(1)}% s/ventas
            </p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Resultado ejercicio</p>
          <p className={cn("mt-2 text-2xl font-bold", yearly.resultado_ejercicio >= 0 ? "text-green-600" : "text-red-500")}>
            {formatCurrency(yearly.resultado_ejercicio)}
          </p>
          {yearly.ventas > 0 && (
            <p className="mt-1 text-xs text-gray-400">
              {((yearly.resultado_ejercicio / yearly.ventas) * 100).toFixed(1)}% s/ventas
            </p>
          )}
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {yearly.ventas === 0 && yearly.aprovisionamientos === 0 ? (
          <p className="px-6 py-16 text-center text-sm text-gray-400">
            No hay datos para {activeEntity.companyName} en {year}.
          </p>
        ) : (
          <PlTable entity={activeEntity} />
        )}
      </div>
    </div>
  );
}
