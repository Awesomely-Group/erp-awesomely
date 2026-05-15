"use client";

import React from "react";

interface FeeEntry {
  id: string;
  label: string;
  monthlyFee: number;
  maxHoursPerMonth: number;
}

interface MonthData {
  month: string; // "2025-01"
  totalHours: number;
  totalCost: number;
}

interface Props {
  entries: FeeEntry[];
  months: MonthData[];
  totalHours: number;
}

function monthLabel(month: string): string {
  const [year, m] = month.split("-");
  const d = new Date(Number(year), Number(m) - 1, 1);
  return d.toLocaleDateString("es-ES", { month: "short", year: "2-digit" });
}

function fmt(n: number): string {
  return n.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

export function ProjectRegularFeeSection({ entries, months, totalHours }: Props): React.JSX.Element {
  const totalMonthlyFee = entries.reduce((s, e) => s + e.monthlyFee, 0);
  const totalMaxHours = entries.reduce((s, e) => s + e.maxHoursPerMonth, 0);
  const numMonths = months.length || 1;

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

      {entries.length === 0 ? (
        <p className="text-sm text-gray-400">No hay fees configurados. Usa "Configurar" para añadirlos.</p>
      ) : (
        <>
          {/* Per-person fee table */}
          <div className="mb-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide pb-2">Persona / Perfil</th>
                  <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wide pb-2">Fee/mes</th>
                  <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wide pb-2">Horas máx./mes</th>
                  <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wide pb-2">€/hora impl.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {entries.map((e) => {
                  const implRate = e.maxHoursPerMonth > 0 ? e.monthlyFee / e.maxHoursPerMonth : null;
                  return (
                    <tr key={e.id}>
                      <td className="py-2 font-medium text-gray-800">{e.label}</td>
                      <td className="py-2 text-right tabular-nums text-gray-700">{fmt(e.monthlyFee)}</td>
                      <td className="py-2 text-right tabular-nums text-gray-700">{e.maxHoursPerMonth} h</td>
                      <td className="py-2 text-right tabular-nums text-gray-400 text-xs">
                        {implRate !== null ? `${implRate.toFixed(2)} €/h` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 font-semibold">
                  <td className="pt-2 text-gray-700">Total</td>
                  <td className="pt-2 text-right tabular-nums text-gray-900">{fmt(totalMonthlyFee)}</td>
                  <td className="pt-2 text-right tabular-nums text-gray-900">{totalMaxHours} h</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Summary KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <div className="bg-gray-50 rounded-lg px-4 py-3">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Fee total/mes</p>
              <p className="text-lg font-bold text-gray-900">{fmt(totalMonthlyFee)}</p>
            </div>
            <div className="bg-gray-50 rounded-lg px-4 py-3">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Horas máx./mes</p>
              <p className="text-lg font-bold text-gray-900">{totalMaxHours} h</p>
            </div>
            <div className="bg-gray-50 rounded-lg px-4 py-3">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Horas reales</p>
              <p className="text-lg font-bold text-gray-900">{totalHours.toFixed(1)} h</p>
            </div>
            <div className="bg-gray-50 rounded-lg px-4 py-3">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Fee acum. período</p>
              <p className="text-lg font-bold text-gray-900">{fmt(totalMonthlyFee * numMonths)}</p>
            </div>
          </div>

          {/* Monthly breakdown */}
          {months.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide pb-2">Mes</th>
                    <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wide pb-2">Horas reales</th>
                    <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wide pb-2">vs. máx.</th>
                    <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wide pb-2">Coste real</th>
                    <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wide pb-2">Fee acordado</th>
                    <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wide pb-2">Diferencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {months.map((m) => {
                    const hPct = totalMaxHours > 0 ? (m.totalHours / totalMaxHours) * 100 : null;
                    const diff = totalMonthlyFee - m.totalCost;
                    const hOver = hPct !== null && hPct > 100;

                    return (
                      <tr key={m.month}>
                        <td className="py-2 text-gray-700">{monthLabel(m.month)}</td>
                        <td className="py-2 text-right font-mono text-gray-800">{m.totalHours.toFixed(1)} h</td>
                        <td className={`py-2 text-right text-xs ${hOver ? "text-red-600 font-semibold" : "text-gray-400"}`}>
                          {hPct !== null ? `${hPct.toFixed(0)}%` : "—"}
                        </td>
                        <td className="py-2 text-right font-mono text-gray-800">{fmt(m.totalCost)}</td>
                        <td className="py-2 text-right font-mono text-gray-500">{fmt(totalMonthlyFee)}</td>
                        <td className={`py-2 text-right font-mono text-xs ${diff < 0 ? "text-red-600 font-semibold" : "text-green-600"}`}>
                          {diff >= 0 ? "+" : ""}{fmt(diff)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
