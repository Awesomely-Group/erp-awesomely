"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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

const MARCA_ALL_OPTIONS = [
  { value: MARCA_FILTER_UNASSIGNED, label: "Sin asignar" },
  ...MARCA_OPTIONS,
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
  const [selectedMarcas, setSelectedMarcas] = useState<string[]>(
    sp.get("marca")?.split(",").filter(Boolean) ?? []
  );
  const [marcaOpen, setMarcaOpen] = useState(false);
  const marcaContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!marcaOpen) return;
    function handlePointerDown(e: PointerEvent): void {
      if (marcaContainerRef.current && !marcaContainerRef.current.contains(e.target as Node)) {
        setMarcaOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [marcaOpen]);

  function applyWith(overrides: Partial<{
    search: string; period: string; dateFrom: string; dateTo: string;
    status: string; type: string; marca: string;
  }>): void {
    const m = {
      search, period, dateFrom, dateTo, status, type,
      marca: selectedMarcas.join(","),
      ...overrides,
    };
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

  function toggleMarca(value: string): void {
    const next = selectedMarcas.includes(value)
      ? selectedMarcas.filter((m) => m !== value)
      : [...selectedMarcas, value];
    setSelectedMarcas(next);
    applyWith({ marca: next.join(",") });
  }

  function reset(): void {
    setSearch("");
    setPeriod("");
    setDateFrom("");
    setDateTo("");
    setStatus("");
    setType("");
    setSelectedMarcas([]);
    setMarcaOpen(false);
    router.push("/invoices");
  }

  const marcaLabel =
    selectedMarcas.length === 0
      ? "Todas"
      : selectedMarcas.length === 1
        ? (MARCA_ALL_OPTIONS.find((o) => o.value === selectedMarcas[0])?.label ?? selectedMarcas[0])
        : `${selectedMarcas.length} marcas`;

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

      {/* Marca multiselect */}
      <div className="flex flex-col gap-1" ref={marcaContainerRef}>
        <label className="text-xs text-gray-500 font-medium">Marca</label>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMarcaOpen((o) => !o)}
            className={`rounded-lg border px-3 py-2 text-sm bg-white text-left min-w-[11rem] flex items-center justify-between gap-2 transition-colors ${
              selectedMarcas.length > 0
                ? "border-indigo-500 text-indigo-700"
                : "border-gray-300 text-gray-700"
            }`}
          >
            <span className="truncate">{marcaLabel}</span>
            <svg
              className={`h-4 w-4 flex-shrink-0 text-gray-400 transition-transform ${marcaOpen ? "rotate-180" : ""}`}
              viewBox="0 0 20 20" fill="currentColor"
            >
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>

          {marcaOpen && (
            <div className="absolute top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[11rem] overflow-hidden">
              {MARCA_ALL_OPTIONS.map((o) => (
                <label
                  key={o.value}
                  className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedMarcas.includes(o.value)}
                    onChange={() => toggleMarca(o.value)}
                    className="rounded border-gray-300 text-indigo-600 flex-shrink-0"
                  />
                  <span className="text-sm text-gray-800">{o.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>
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
