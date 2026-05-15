"use client";

import React from "react";
import { formatCurrency } from "@/lib/utils";

interface MonthData {
  month: string; // "2025-01"
  totalHours: number;
  totalCost: number;
}

interface Props {
  monthlyFee: number | null;
  maxHoursPerMonth: number | null;
  months: MonthData[];
  totalHours: number;
}

function monthLabel(month: string): string {
  const [year, m] = month.split("-");
  const d = new Date(Number(year), Number(m) - 1, 1);
  return d.toLocaleDateString("es-ES", { month: "short", year: "2-digit" });
}

export function ProjectRegularFeeSection({ monthlyFee, maxHoursPerMonth, months, totalHours }: Props): React.JSX.Element {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
          </svg>
          Fee regular
        </span>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="bg-gray-50 rounded-lg px-4 py-3">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Fee mensual</p>
          <p className="text-lg font-bold text-gray-900">
            {monthlyFee !== null ? formatCurrency(monthlyFee) : <span className="text-gray-300">—</span>}
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg px-4 py-3">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Horas máx./mes</p>
          <p className="text-lg font-bold text-gray-900">
            {maxHoursPerMonth !== null ? `${maxHoursPerMonth} h` : <span className="text-gray-300">—</span>}
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg px-4 py-3">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Horas totales</p>
          <p className="text-lg font-bold text-gray-900">{totalHours.toFixed(1)} h</p>
        </div>
        <div className="bg-gray-50 rounded-lg px-4 py-3">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Meses</p>
          <p className="text-lg font-bold text-gray-900">{months.length}</p>
        </div>
      </div>

      {/* Monthly breakdown table */}
      {months.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide pb-2">Mes</th>
                <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wide pb-2">Horas</th>
                {maxHoursPerMonth !== null && (
                  <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wide pb-2">vs. máx.</th>
                )}
                <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wide pb-2">Coste</th>
                {monthlyFee !== null && (
                  <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wide pb-2">vs. fee</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {months.map((m) => {
                const hPct = maxHoursPerMonth && maxHoursPerMonth > 0
                  ? (m.totalHours / maxHoursPerMonth) * 100
                  : null;
                const cPct = monthlyFee && monthlyFee > 0
                  ? (m.totalCost / monthlyFee) * 100
                  : null;
                const hOver = hPct !== null && hPct > 100;
                const cOver = cPct !== null && cPct > 100;

                return (
                  <tr key={m.month}>
                    <td className="py-2 text-gray-700">{monthLabel(m.month)}</td>
                    <td className="py-2 text-right font-mono text-gray-800">{m.totalHours.toFixed(1)} h</td>
                    {maxHoursPerMonth !== null && (
                      <td className={`py-2 text-right text-xs ${hOver ? "text-red-600 font-semibold" : "text-gray-400"}`}>
                        {hPct !== null ? `${hPct.toFixed(0)}%` : "—"}
                      </td>
                    )}
                    <td className="py-2 text-right font-mono text-gray-800">{formatCurrency(m.totalCost)}</td>
                    {monthlyFee !== null && (
                      <td className={`py-2 text-right text-xs ${cOver ? "text-red-600 font-semibold" : "text-gray-400"}`}>
                        {cPct !== null ? `${cPct.toFixed(0)}%` : "—"}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-gray-400">Sin datos de horas en este período.</p>
      )}

      {(!monthlyFee || !maxHoursPerMonth) && (
        <p className="text-xs text-purple-600 mt-3 bg-purple-50 rounded-lg px-3 py-2">
          Configura el fee mensual y las horas máximas para ver el análisis completo.
        </p>
      )}
    </div>
  );
}
