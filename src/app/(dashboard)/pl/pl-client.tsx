"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlData, PlEntityData, PlMonthPoint } from "@/lib/pl-data";

interface PlClientProps {
  plData: PlData;
  years: number[];
}

const MONTHS = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

function fmt(amount: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function ResultBadge({ value }: { value: number }): React.JSX.Element {
  const positive = value >= 0;
  return (
    <span className={cn("font-semibold tabular-nums", positive ? "text-green-600" : "text-red-500")}>
      {fmt(value)}
    </span>
  );
}

function PlTable({ entity, l1Categories }: { entity: PlEntityData; l1Categories: string[] }): React.JSX.Element {
  const [expensesExpanded, setExpensesExpanded] = useState(false);

  const months: PlMonthPoint[] = entity.months;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse min-w-[900px]">
        <thead>
          <tr className="border-b-2 border-gray-200">
            <th className="sticky left-0 z-10 bg-white px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-40">
              Concepto
            </th>
            {MONTHS.map((m) => (
              <th key={m} className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide min-w-[90px]">
                {m}
              </th>
            ))}
            <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-700 uppercase tracking-wide min-w-[100px] bg-gray-50">
              TOTAL
            </th>
          </tr>
        </thead>
        <tbody>
          {/* Ingresos */}
          <tr className="border-b border-gray-100 bg-green-50/40 hover:bg-green-50 transition-colors">
            <td className="sticky left-0 z-10 bg-green-50/40 px-4 py-3 font-semibold text-gray-800">
              Ingresos
            </td>
            {months.map((m) => (
              <td key={m.monthKey} className="px-3 py-3 text-right tabular-nums text-gray-700">
                {m.revenue > 0 ? fmt(m.revenue) : <span className="text-gray-300">—</span>}
              </td>
            ))}
            <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-800 bg-green-50">
              {fmt(entity.yearly.revenue)}
            </td>
          </tr>

          {/* Gastos — header row (expandable) */}
          <tr
            className="border-b border-gray-100 bg-red-50/30 hover:bg-red-50/60 transition-colors cursor-pointer"
            onClick={() => setExpensesExpanded(!expensesExpanded)}
          >
            <td className="sticky left-0 z-10 bg-red-50/30 px-4 py-3 font-semibold text-gray-800">
              <div className="flex items-center gap-1.5">
                {expensesExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-gray-500" />
                )}
                Gastos
              </div>
            </td>
            {months.map((m) => (
              <td key={m.monthKey} className="px-3 py-3 text-right tabular-nums text-gray-700">
                {m.totalExpenses > 0 ? fmt(m.totalExpenses) : <span className="text-gray-300">—</span>}
              </td>
            ))}
            <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-800 bg-red-50/60">
              {fmt(entity.yearly.totalExpenses)}
            </td>
          </tr>

          {/* Gastos — subcategorías L1 */}
          {expensesExpanded &&
            l1Categories.map((l1) => (
              <tr key={l1} className="border-b border-gray-50 bg-gray-50/30 hover:bg-gray-50 transition-colors">
                <td className="sticky left-0 z-10 bg-gray-50/30 pl-9 pr-4 py-2.5 text-xs text-gray-500 font-medium">
                  {l1}
                </td>
                {months.map((m) => {
                  const amt = m.expensesByL1[l1] ?? 0;
                  return (
                    <td key={m.monthKey} className="px-3 py-2.5 text-right tabular-nums text-xs text-gray-500">
                      {amt > 0 ? fmt(amt) : <span className="text-gray-200">—</span>}
                    </td>
                  );
                })}
                <td className="px-4 py-2.5 text-right tabular-nums text-xs font-medium text-gray-600 bg-gray-50/60">
                  {fmt(entity.yearly.expensesByL1[l1] ?? 0)}
                </td>
              </tr>
            ))}

          {/* Resultado */}
          <tr className="border-t-2 border-gray-200 bg-white">
            <td className="sticky left-0 z-10 bg-white px-4 py-3.5 font-bold text-gray-900">
              Resultado
            </td>
            {months.map((m) => (
              <td key={m.monthKey} className="px-3 py-3.5 text-right tabular-nums">
                {m.revenue > 0 || m.totalExpenses > 0 ? (
                  <ResultBadge value={m.result} />
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </td>
            ))}
            <td className="px-4 py-3.5 text-right bg-gray-50">
              <ResultBadge value={entity.yearly.result} />
            </td>
          </tr>

          {/* Margen */}
          <tr className="border-b border-gray-100 bg-white">
            <td className="sticky left-0 z-10 bg-white px-4 py-2 text-xs font-medium text-gray-400">
              Margen
            </td>
            {months.map((m) => {
              const margin = m.revenue > 0 ? (m.result / m.revenue) * 100 : null;
              return (
                <td key={m.monthKey} className="px-3 py-2 text-right text-xs tabular-nums text-gray-400">
                  {margin !== null ? (
                    <span className={margin >= 0 ? "text-green-500" : "text-red-400"}>
                      {margin.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-gray-200">—</span>
                  )}
                </td>
              );
            })}
            <td className="px-4 py-2 text-right text-xs bg-gray-50">
              {entity.yearly.revenue > 0 ? (
                <span
                  className={
                    entity.yearly.result / entity.yearly.revenue >= 0
                      ? "text-green-500 font-medium"
                      : "text-red-400 font-medium"
                  }
                >
                  {((entity.yearly.result / entity.yearly.revenue) * 100).toFixed(1)}%
                </span>
              ) : (
                <span className="text-gray-200">—</span>
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function PlClient({ plData, years }: PlClientProps): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<string>("consolidated");

  const { year, entities, consolidated, l1Categories } = plData;

  const activeEntity =
    activeTab === "consolidated"
      ? consolidated
      : (entities.find((e) => e.companyId === activeTab) ?? consolidated);

  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", e.target.value);
    router.push(`/pl?${params.toString()}`);
  };

  const netIsPositive = consolidated.yearly.result >= 0;
  const margin =
    consolidated.yearly.revenue > 0
      ? (consolidated.yearly.result / consolidated.yearly.revenue) * 100
      : null;

  return (
    <div className="space-y-6">
      {/* KPIs consolidados */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Ingresos {year}</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{fmt(consolidated.yearly.revenue)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Gastos {year}</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{fmt(consolidated.yearly.totalExpenses)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Resultado {year}</p>
          <p className={cn("mt-2 text-2xl font-bold", netIsPositive ? "text-green-600" : "text-red-500")}>
            {fmt(consolidated.yearly.result)}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Margen {year}</p>
          <p className={cn("mt-2 text-2xl font-bold", margin !== null && margin >= 0 ? "text-indigo-600" : "text-red-500")}>
            {margin !== null ? `${margin.toFixed(1)}%` : "—"}
          </p>
        </div>
      </div>

      {/* Tabs + tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Tab bar */}
        <div className="flex items-center justify-between gap-4 border-b border-gray-200 px-4 py-0">
          <div className="flex gap-0 overflow-x-auto">
            <button
              onClick={() => setActiveTab("consolidated")}
              className={cn(
                "px-4 py-3.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
                activeTab === "consolidated"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              )}
            >
              Consolidado
            </button>
            {entities.map((e) => (
              <button
                key={e.companyId}
                onClick={() => setActiveTab(e.companyId)}
                className={cn(
                  "px-4 py-3.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
                  activeTab === e.companyId
                    ? "border-indigo-600 text-indigo-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                )}
              >
                {e.companyName}
              </button>
            ))}
          </div>

          {/* Selector de año */}
          <select
            value={year}
            onChange={handleYearChange}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent my-2"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        {/* Tabla */}
        <div className="p-0">
          {activeEntity.yearly.revenue === 0 && activeEntity.yearly.totalExpenses === 0 ? (
            <p className="px-6 py-16 text-center text-sm text-gray-400">
              No hay datos para {activeEntity.companyName} en {year}.
            </p>
          ) : (
            <PlTable entity={activeEntity} l1Categories={l1Categories} />
          )}
        </div>
      </div>
    </div>
  );
}
