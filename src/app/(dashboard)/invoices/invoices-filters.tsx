"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { Columns3 } from "lucide-react";
import {
  MARCA_FILTER_UNASSIGNED,
  MARCA_OPTIONS,
  STATUS_FILTER_UNASSIGNED,
} from "@/lib/org";
import { OPTIONAL_COLUMNS, type ColumnKey } from "./columns";

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

interface Project { id: string; jiraKey: string; name: string }

interface Props {
  projects?: Project[];
  visibleCols: ColumnKey[];
  invoiceType: "SALE" | "PURCHASE";
  holdedStatus?: string;
}

export function InvoicesFilters({ projects = [], visibleCols, invoiceType }: Props): React.JSX.Element {
  const router = useRouter();
  const sp = useSearchParams();

  const [search, setSearch] = useState(sp.get("search") ?? "");
  const [period, setPeriod] = useState(sp.get("period") ?? "");
  const [dateFrom, setDateFrom] = useState(sp.get("dateFrom") ?? "");
  const [dateTo, setDateTo] = useState(sp.get("dateTo") ?? "");
  const [status, setStatus] = useState(sp.get("status") ?? "");
  const [selectedMarca, setSelectedMarca] = useState(sp.get("marca") ?? "");
  const [selectedProject, setSelectedProject] = useState(sp.get("project") ?? "");
  const [holdedPresence, setHoldedPresence] = useState(sp.get("holdedPresence") ?? "active");
  const [selectedRecurrence, setSelectedRecurrence] = useState(sp.get("recurrence") ?? "");
  const [selectedHoldedStatus, setSelectedHoldedStatus] = useState(sp.get("holdedStatus") ?? "");
  const [showColMenu, setShowColMenu] = useState(false);

  const colMenuRef = useRef<HTMLDivElement>(null);

  // Close column menu when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) {
        setShowColMenu(false);
      }
    }
    if (showColMenu) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showColMenu]);

  function applyWith(overrides: Partial<{
    search: string; period: string; dateFrom: string; dateTo: string;
    status: string; marca: string; project: string; holdedPresence: string;
    recurrence: string; cols: string; holdedStatus: string;
  }>): void {
    const m = {
      search, period, dateFrom, dateTo, status,
      type: sp.get("type") ?? "",
      marca: selectedMarca,
      project: selectedProject,
      holdedPresence,
      recurrence: selectedRecurrence,
      holdedStatus: selectedHoldedStatus,
      cols: sp.get("cols") ?? "",
      ...overrides,
    };
    const params = new URLSearchParams();
    if (m.search) params.set("search", m.search);
    if (m.status) params.set("status", m.status);
    if (m.type) params.set("type", m.type);
    if (m.marca) params.set("marca", m.marca);
    if (m.project) params.set("project", m.project);
    if (m.holdedPresence && m.holdedPresence !== "active") params.set("holdedPresence", m.holdedPresence);
    if (m.recurrence) params.set("recurrence", m.recurrence);
    if (m.holdedStatus) params.set("holdedStatus", m.holdedStatus);
    // Preserve column preferences across filter changes (only omit if all cols are visible)
    if (m.cols) params.set("cols", m.cols);
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
    setSelectedMarca("");
    setSelectedProject("");
    setHoldedPresence("active");
    setSelectedRecurrence("");
    setSelectedHoldedStatus("");
    const currentType = sp.get("type") ?? "";
    const currentCols = sp.get("cols") ?? "";
    const params = new URLSearchParams();
    if (currentType) params.set("type", currentType);
    // Preserve column preferences on reset
    if (currentCols) params.set("cols", currentCols);
    router.push(`/invoices?${params.toString()}`);
  }

  function toggleColumn(key: ColumnKey): void {
    const currentSet = new Set(visibleCols);
    if (currentSet.has(key)) {
      currentSet.delete(key);
    } else {
      currentSet.add(key);
    }
    // Maintain the canonical order
    const ordered = OPTIONAL_COLUMNS
      .filter((c) => currentSet.has(c.key))
      .map((c) => c.key);
    applyWith({ cols: ordered.join(",") });
  }

  const selectClass = "rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white";

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
          className={selectClass}
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
              className={selectClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500 font-medium">Hasta</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              onBlur={(e) => applyWith({ dateTo: e.target.value })}
              className={selectClass}
            />
          </div>
        </>
      )}

      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500 font-medium">Estado</label>
        <select
          value={status}
          onChange={(e) => { const v = e.target.value; setStatus(v); applyWith({ status: v }); }}
          className={selectClass}
        >
          <option value="">Todos</option>
          <option value={STATUS_FILTER_UNASSIGNED}>Sin asignar</option>
          <option value="PENDING">Sin clasificar</option>
          <option value="SIN_MARCA">Sin Marca</option>
          <option value="PARTIAL">Parcial</option>
          <option value="CLASSIFIED">Clasificado</option>
        </select>
      </div>

      {invoiceType === "PURCHASE" && (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">Recurrencia</label>
          <select
            value={selectedRecurrence}
            onChange={(e) => { const v = e.target.value; setSelectedRecurrence(v); applyWith({ recurrence: v }); }}
            className={selectClass}
          >
            <option value="">Todas</option>
            <option value="PUNTUAL">Puntual</option>
            <option value="MENSUAL">Mensual</option>
            <option value="ANUAL">Anual</option>
            <option value="EXTRAORDINARIO">Extraordinario</option>
            <option value="none">Sin clasificar</option>
          </select>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500 font-medium">Marca</label>
        <select
          value={selectedMarca}
          onChange={(e) => { const v = e.target.value; setSelectedMarca(v); applyWith({ marca: v }); }}
          className={`${selectClass} w-44`}
        >
          <option value="">Todas</option>
          {MARCA_ALL_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {projects.length > 0 && (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">Proyecto</label>
          <select
            value={selectedProject}
            onChange={(e) => { const v = e.target.value; setSelectedProject(v); applyWith({ project: v }); }}
            className={`${selectClass} w-52`}
          >
            <option value="">Todos</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.jiraKey} — {p.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500 font-medium">
          {invoiceType === "SALE" ? "Cobro" : "Pago"}
        </label>
        <select
          value={selectedHoldedStatus}
          onChange={(e) => { const v = e.target.value; setSelectedHoldedStatus(v); applyWith({ holdedStatus: v }); }}
          className={selectClass}
        >
          <option value="">Todos</option>
          <option value="1">Pendiente</option>
          <option value="2">{invoiceType === "SALE" ? "Cobrada" : "Pagada"}</option>
          <option value="3">Vencida</option>
          <option value="-1">Cancelada</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500 font-medium">En Holded</label>
        <select
          value={holdedPresence}
          onChange={(e) => { const v = e.target.value; setHoldedPresence(v); applyWith({ holdedPresence: v }); }}
          className={selectClass}
        >
          <option value="active">Solo activas</option>
          <option value="all">Todas (incl. eliminadas)</option>
          <option value="removed">Solo eliminadas</option>
        </select>
      </div>

      <button
        type="button"
        onClick={reset}
        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
      >
        Limpiar
      </button>

      {/* Column selector */}
      <div className="relative" ref={colMenuRef}>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium invisible">Columnas</label>
          <button
            type="button"
            onClick={() => setShowColMenu((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              showColMenu
                ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                : "border-gray-300 text-gray-600 hover:bg-gray-50"
            }`}
          >
            <Columns3 className="h-4 w-4" />
            Columnas
          </button>
        </div>

        {showColMenu && (
          <div className="absolute right-0 top-full mt-1 z-50 w-52 rounded-xl border border-gray-200 bg-white shadow-lg p-3 flex flex-col gap-1.5">
            <p className="text-xs font-semibold text-gray-500 mb-1">
              Columnas visibles
            </p>
            <p className="text-[10px] text-gray-400 -mt-1 mb-1">
              Número y Contraparte siempre visibles
            </p>
            {OPTIONAL_COLUMNS.map((col) => (
              <label
                key={col.key}
                className="flex items-center gap-2 cursor-pointer rounded-md px-1 py-0.5 hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={visibleCols.includes(col.key)}
                  onChange={() => toggleColumn(col.key)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-700">{col.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
