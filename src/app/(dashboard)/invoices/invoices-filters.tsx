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

const MARCA_ALL_OPTIONS = [
  { value: MARCA_FILTER_UNASSIGNED, label: "Sin asignar" },
  ...MARCA_OPTIONS,
];

interface Project { id: string; jiraKey: string; name: string }

export function InvoicesFilters({ projects = [] }: { projects?: Project[] }): React.JSX.Element {
  const router = useRouter();
  const sp = useSearchParams();

  const [search, setSearch] = useState(sp.get("search") ?? "");
  const [period, setPeriod] = useState(sp.get("period") ?? "");
  const [dateFrom, setDateFrom] = useState(sp.get("dateFrom") ?? "");
  const [dateTo, setDateTo] = useState(sp.get("dateTo") ?? "");
  const [status, setStatus] = useState(sp.get("status") ?? "");
  const [selectedMarca, setSelectedMarca] = useState(sp.get("marca") ?? "");
  const [selectedProject, setSelectedProject] = useState(sp.get("project") ?? "");

  function applyWith(overrides: Partial<{
    search: string; period: string; dateFrom: string; dateTo: string;
    status: string; marca: string; project: string;
  }>): void {
    const m = {
      search, period, dateFrom, dateTo, status,
      type: sp.get("type") ?? "",
      marca: selectedMarca,
      project: selectedProject,
      ...overrides,
    };
    const params = new URLSearchParams();
    if (m.search) params.set("search", m.search);
    if (m.status) params.set("status", m.status);
    if (m.type) params.set("type", m.type);
    if (m.marca) params.set("marca", m.marca);
    if (m.project) params.set("project", m.project);
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
    const currentType = sp.get("type") ?? "";
    const params = new URLSearchParams();
    if (currentType) params.set("type", currentType);
    router.push(`/invoices?${params.toString()}`);
  }

  const selectClass = "rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white";

  return (
    <div className="flex flex-wrap gap-3 items-end min-w-max">
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
          <option value="PARTIAL">Parcial</option>
          <option value="CLASSIFIED">Clasificado</option>
          <option value="APPROVED">Aprobado</option>
        </select>
      </div>

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
