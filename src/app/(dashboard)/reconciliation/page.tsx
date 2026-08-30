import { Suspense } from "react";
import { getHourlyReconciliation } from "@/lib/reconciliation";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { ReconciliationFilters } from "./reconciliation-filters";

interface Props {
  searchParams: Promise<{ from?: string; to?: string }>;
}

/**
 * Últimos 12 meses completos (incluido el actual), si no viene rango en la URL.
 * "Mes en curso" a secas dejaba la pantalla casi siempre vacía: la facturación de un
 * proyecto no se reparte uniformemente mes a mes, así que hacía falta una ventana
 * más ancha para que la comparación horas↔facturas dijera algo de verdad.
 */
function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export default async function ReconciliationPage({ searchParams }: Props): Promise<React.JSX.Element> {
  const sp = await searchParams;
  const defaults = defaultRange();
  const fromStr = sp.from ?? defaults.from;
  const toStr = sp.to ?? defaults.to;

  const rows = await getHourlyReconciliation(new Date(fromStr), new Date(toStr));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Conciliación</h1>
          <p className="text-sm text-gray-500 mt-1">
            Horas y coste aprobados en Giro contra lo facturado, por proyecto facturado por horas.
            Los proyectos a precio cerrado no aparecen: ahí el importe no tiene por qué seguir las
            horas.
          </p>
        </div>
        <Suspense>
          <ReconciliationFilters from={fromStr} to={toStr} />
        </Suspense>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-500">
          Ningún proyecto por horas tiene todavía un proyecto de Giro vinculado
          (<code className="font-mono text-xs">giroProjectId</code>). Se vincula desde la ficha de
          cada proyecto.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Proyecto</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Horas aprobadas</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Coste aprobado</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Facturado</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Diferencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.projectId}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{row.name}</p>
                    <p className="text-xs text-gray-400">
                      <span className="font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-[11px] mr-1">
                        {row.jiraKey}
                      </span>
                      {row.workspaceName}
                    </p>
                  </td>
                  <td className="text-right px-4 py-3 text-gray-700">
                    {row.approvedHours !== null ? row.approvedHours.toFixed(1) : "—"}
                  </td>
                  <td className="text-right px-4 py-3 text-gray-700">
                    {row.approvedCost !== null ? formatCurrency(row.approvedCost) : "Sin tarifa"}
                  </td>
                  <td className="text-right px-4 py-3 text-gray-700">{formatCurrency(row.invoicedEur)}</td>
                  <td
                    className={cn(
                      "text-right px-4 py-3 font-medium",
                      row.difference === null
                        ? "text-gray-400"
                        : row.difference < 0
                          ? "text-red-600"
                          : "text-green-700",
                    )}
                  >
                    {row.error ? (
                      <span className="text-xs font-normal text-amber-600" title={row.error}>
                        {row.error}
                      </span>
                    ) : row.difference !== null ? (
                      formatCurrency(row.difference)
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
