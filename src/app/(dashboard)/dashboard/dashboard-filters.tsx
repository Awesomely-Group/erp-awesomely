"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { MARCA_FILTER_UNASSIGNED, MARCA_OPTIONS } from "@/lib/org";

const PERIODS = [
  { value: "", label: "Todas las fechas" },
  { value: "this_month", label: "Este mes" },
  { value: "last_month", label: "Mes pasado" },
  { value: "this_quarter", label: "Este trimestre" },
  { value: "last_quarter", label: "Trimestre pasado" },
  { value: "this_year", label: "Este año" },
  { value: "last_year", label: "Año pasado" },
  { value: "custom", label: "Personalizado…" },
];

export function DashboardFilters(): React.JSX.Element {
  const router = useRouter();
  const sp = useSearchParams();

  const [period, setPeriod] = useState(sp.get("period") ?? "");
  const [dateFrom, setDateFrom] = useState(sp.get("dateFrom") ?? "");
  const [dateTo, setDateTo] = useState(sp.get("dateTo") ?? "");
  const [marca, setMarca] = useState(sp.get("marca") ?? "");

  function applyWith(overrides: Partial<{
    period: string; dateFrom: string; dateTo: string; marca: string;
  }>): void {
    const m = { period, dateFrom, dateTo, marca, ...overrides };
    const params = new URLSearchParams();
    if (m.period) {
      params.set("period", m.period);
      if (m.period === "custom") {
        if (m.dateFrom) params.set("dateFrom", m.dateFrom);
        if (m.dateTo) params.set("dateTo", m.dateTo);
      }
    }
    if (m.marca) params.set("marca", m.marca);
    const q = params.toString();
    router.push(q ? `/dashboard?${q}` : "/dashboard");
  }

  function reset(): void {
    setPeriod("");
    setDateFrom("");
    setDateTo("");
    setMarca("");
    router.push("/dashboard");
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs font-medium text-gray-500 mb-3">Filtros del resumen</p>
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">Periodo</label>
          <select
            value={period}
            onChange={(e) => {
              const v = e.target.value;
              setPeriod(v);
              if (v !== "custom") applyWith({ period: v, dateFrom: "", dateTo: "" });
            }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white min-w-[11rem]"
          >
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>

        {period === "custom" && (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500 font-medium">Desde</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                onBlur={(e) => applyWith({ dateFrom: e.target.value })}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500 font-medium">Hasta</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                onBlur={(e) => applyWith({ dateTo: e.target.value })}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
              />
            </div>
          </>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">Marca</label>
          <select
            value={marca}
            onChange={(e) => { const v = e.target.value; setMarca(v); applyWith({ marca: v }); }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white min-w-[12rem]"
          >
            <option value="">Todas</option>
            <option value={MARCA_FILTER_UNASSIGNED}>Sin asignar</option>
            {MARCA_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={reset}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Limpiar
        </button>
      </div>
    </div>
  );
}
