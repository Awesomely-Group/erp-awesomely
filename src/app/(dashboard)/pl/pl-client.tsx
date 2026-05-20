"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlEntityData } from "@/lib/pl-data";

interface PlTableProps {
  entity: PlEntityData;
  l1Categories: string[];
}

function fmtCell(n: number): string {
  if (n === 0) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (abs >= 1_000) return `${Math.round(n / 1_000)}k`;
  return `${Math.round(n)}`;
}

function fmtTotal(n: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

const MONTH_LABELS = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

export function PlTable({ entity, l1Categories }: PlTableProps): React.JSX.Element {
  const [expensesExpanded, setExpensesExpanded] = useState(false);
  const { months, yearly } = entity;

  const yearlyMargin = yearly.revenue > 0 ? (yearly.result / yearly.revenue) * 100 : null;

  return (
    <table className="w-full table-fixed text-sm border-collapse">
      <colgroup>
        <col className="w-36" />
        {MONTH_LABELS.map((m) => <col key={m} />)}
        <col className="w-28" />
      </colgroup>
      <thead>
        <tr className="border-b-2 border-gray-200">
          <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Concepto
          </th>
          {MONTH_LABELS.map((m) => (
            <th key={m} className="px-1.5 py-2.5 text-right text-xs font-semibold text-gray-400 uppercase tracking-wide">
              {m}
            </th>
          ))}
          <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-600 uppercase tracking-wide bg-gray-50">
            TOTAL
          </th>
        </tr>
      </thead>
      <tbody>
        {/* Ingresos */}
        <tr className="border-b border-gray-100 bg-green-50/40 hover:bg-green-50/70 transition-colors">
          <td className="px-4 py-3 font-semibold text-gray-800">Ingresos</td>
          {months.map((m) => (
            <td key={m.monthKey} className="px-1.5 py-3 text-right tabular-nums text-gray-700">
              {m.revenue > 0 ? fmtCell(m.revenue) : <span className="text-gray-200">—</span>}
            </td>
          ))}
          <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-800 bg-green-50">
            {fmtTotal(yearly.revenue)}
          </td>
        </tr>

        {/* Gastos — fila expandible */}
        <tr
          className="border-b border-gray-100 bg-red-50/20 hover:bg-red-50/50 transition-colors cursor-pointer"
          onClick={() => setExpensesExpanded((v) => !v)}
        >
          <td className="px-4 py-3 font-semibold text-gray-800">
            <div className="flex items-center gap-1.5">
              {expensesExpanded
                ? <ChevronDown className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                : <ChevronRight className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />}
              Gastos
            </div>
          </td>
          {months.map((m) => (
            <td key={m.monthKey} className="px-1.5 py-3 text-right tabular-nums text-gray-700">
              {m.totalExpenses > 0 ? fmtCell(m.totalExpenses) : <span className="text-gray-200">—</span>}
            </td>
          ))}
          <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-800 bg-red-50/50">
            {fmtTotal(yearly.totalExpenses)}
          </td>
        </tr>

        {/* Subcategorías L1 */}
        {expensesExpanded && l1Categories.map((l1) => (
          <tr key={l1} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
            <td className="pl-9 pr-4 py-2 text-xs text-gray-500 font-medium truncate">{l1}</td>
            {months.map((m) => {
              const amt = m.expensesByL1[l1] ?? 0;
              return (
                <td key={m.monthKey} className="px-1.5 py-2 text-right tabular-nums text-xs text-gray-400">
                  {amt > 0 ? fmtCell(amt) : <span className="text-gray-200">—</span>}
                </td>
              );
            })}
            <td className="px-4 py-2 text-right tabular-nums text-xs font-medium text-gray-600 bg-gray-50/60">
              {fmtTotal(yearly.expensesByL1[l1] ?? 0)}
            </td>
          </tr>
        ))}

        {/* Resultado */}
        <tr className="border-t-2 border-gray-200 bg-white">
          <td className="px-4 py-3.5 font-bold text-gray-900">Resultado</td>
          {months.map((m) => {
            const hasData = m.revenue > 0 || m.totalExpenses > 0;
            return (
              <td key={m.monthKey} className="px-1.5 py-3.5 text-right tabular-nums font-semibold">
                {hasData ? (
                  <span className={cn(m.result >= 0 ? "text-green-600" : "text-red-500")}>
                    {fmtCell(m.result)}
                  </span>
                ) : (
                  <span className="text-gray-200">—</span>
                )}
              </td>
            );
          })}
          <td className="px-4 py-3.5 text-right bg-gray-50">
            <span className={cn("font-bold tabular-nums", yearly.result >= 0 ? "text-green-600" : "text-red-500")}>
              {fmtTotal(yearly.result)}
            </span>
          </td>
        </tr>

        {/* Margen */}
        <tr className="border-b border-gray-100 bg-white">
          <td className="px-4 py-2 text-xs font-medium text-gray-400">Margen</td>
          {months.map((m) => {
            const pct = m.revenue > 0 ? (m.result / m.revenue) * 100 : null;
            return (
              <td key={m.monthKey} className="px-1.5 py-2 text-right text-xs tabular-nums">
                {pct !== null ? (
                  <span className={pct >= 0 ? "text-green-500" : "text-red-400"}>{pct.toFixed(0)}%</span>
                ) : (
                  <span className="text-gray-200">—</span>
                )}
              </td>
            );
          })}
          <td className="px-4 py-2 text-right text-xs bg-gray-50">
            {yearlyMargin !== null ? (
              <span className={cn("font-medium", yearlyMargin >= 0 ? "text-green-500" : "text-red-400")}>
                {yearlyMargin.toFixed(1)}%
              </span>
            ) : (
              <span className="text-gray-200">—</span>
            )}
          </td>
        </tr>
      </tbody>
    </table>
  );
}
