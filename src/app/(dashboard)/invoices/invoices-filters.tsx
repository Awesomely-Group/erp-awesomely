"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  MARCA_FILTER_UNASSIGNED,
  MARCA_OPTIONS,
  STATUS_FILTER_UNASSIGNED,
} from "@/lib/org";

const PERIODS = [
  { value: "", label: "Todos los periodos" },
  { value: "this_month", label: "Este mes" },
  { value: "last_month", label: "Mes pasado" },
  { value: "this_quarter", label: "Este trimestre" },
  { value: "last_quarter", label: "Trimestre pasado" },
  { value: "this_year", label: "Este año" },
  { value: "last_year", label: "Año pasado" },
  { value: "custom", label: "Personalizado…" },
];

export function InvoicesFilters(): React.JSX.Element {
  const router = useRouter();
  const sp = useSearchParams();

  const [search, setSearch] = useState(sp.get("search") ?? "");
  const [period, setPeriod] = useState(sp.get("period") ?? "");
  const [dateFrom, setDateFrom] = useState(sp.get("dateFrom") ?? "");
  const [dateTo, setDateTo] = useState(sp.get("dateTo") ?? "");
  const [status, setStatus] = useState(sp.get("status") ?? "");
  const [type, setType] = useState(sp.get("type") ?? "");
  const [marca, setMarca] = useState(sp.get("marca") ?? "");

  function applyWith(overrides: Partial<{
    search: string; period: string; dateFrom: string; dateTo: string;
    status: string; type: string; marca: string;
  }>): void {
    const m = { search, period, dateFrom, dateTo, status, type, marca, ...overrides };
    const params = new URLSearchParams();
    if (m.search) params.set("search", m.search);
    if (m.status) params.set("status", m.status);
    if (m.type) params.set("type", m.type);
    if (m.marca) params.set("marca", m.marca);
    if (m.period) {
      params.set("period", m.period);
      if (m.period === "custom") {
        if (m.dateFrom) params.set("dateFrom", m.dateFrom);
        if (m.dateTo) params.set("dateTo", m.dateTo);
      }
    }
    router.push(`/invoices?${params.toString()}`);
  }

  function reset(): void {
    setSearch("");
    setPeriod("");
    setDateFrom("");
    setDateTo("");
    setStatus("");
    setType("");
    setMarca("");
    router.push("/invoices");
  }

  return (
    <div className="flex flex-wrap gap-3 items-end">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500 font-medium">Buscar</label>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applyWith({ search: (e.target as HTMLInputElement).value })}
          onBlur={(e) => { if (e.target.value !== (sp.get("search") ?? "")) applyWith({ search: e.target.value }); }}
          placeholder="Número o contraparte…"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white w-52"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500 font-medium">Periodo</label>
        <select
          value={period}
          onChange={(e) => {
            const v = e.target.value;
            setPeriod(v);
            if (v !== "custom") applyWith({ period: v, dateFrom: "", dateTo: "" });
          }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
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
        <label className="text-xs text-gray-500 font-medium">Estado</label>
        <select
          value={status}
          onChange={(e) => { const v = e.target.value; setStatus(v); applyWith({ status: v }); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
        >
          <option value="">Todos</option>
          <option value={STATUS_FILTER_UNASSIGNED}>Sin asignar</option>
          <option value="PENDING">Sin clasificar</option>
          <option value="PARTIAL">Parcial</option>
          <option value="CLASSIFIED">Clasificado</option>
          <option value="REVIEWED">Revisado</option>
          <option value="APPROVED">Aprobado</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500 font-medium">Tipo</label>
        <select
          value={type}
          onChange={(e) => { const v = e.target.value; setType(v); applyWith({ type: v }); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
        >
          <option value="">Compra y venta</option>
          <option value="SALE">Venta</option>
          <option value="PURCHASE">Compra</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500 font-medium">Marca</label>
        <select
          value={marca}
          onChange={(e) => { const v = e.target.value; setMarca(v); applyWith({ marca: v }); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white min-w-[11rem]"
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
  );
}
