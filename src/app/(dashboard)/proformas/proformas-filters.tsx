"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { MARCA_FILTER_UNASSIGNED, MARCA_OPTIONS } from "@/lib/org";

const PERIODS = [
  { value: "", label: "Todos los períodos" },
  { value: "this_month", label: "Este mes" },
  { value: "last_month", label: "Mes pasado" },
  { value: "this_quarter", label: "Este trimestre" },
  { value: "last_quarter", label: "Trimestre pasado" },
  { value: "this_year", label: "Año en curso" },
  { value: "last_year", label: "Año pasado" },
  { value: "custom", label: "Personalizado…" },
];

const STATUSES = [
  { value: "", label: "Todos los estados" },
  { value: "0", label: "Borrador" },
  { value: "1", label: "Enviada" },
  { value: "2", label: "Aceptada" },
  { value: "-1", label: "Cancelada" },
  { value: "3", label: "Facturado" },
];

const MARCA_ALL_OPTIONS = [
  { value: MARCA_FILTER_UNASSIGNED, label: "Sin asignar" },
  ...MARCA_OPTIONS,
];

function ChevronIcon({ open }: { open: boolean }): React.JSX.Element {
  return (
    <svg
      className={`h-4 w-4 flex-shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
        clipRule="evenodd"
      />
    </svg>
  );
}

type Project = { id: string; name: string };

export function ProformasFilters({
  projects,
}: {
  projects: Project[];
}): React.JSX.Element {
  const router = useRouter();
  const sp = useSearchParams();

  const [search, setSearch] = useState(sp.get("search") ?? "");
  const [period, setPeriod] = useState(sp.get("period") ?? "");
  const [dateFrom, setDateFrom] = useState(sp.get("dateFrom") ?? "");
  const [dateTo, setDateTo] = useState(sp.get("dateTo") ?? "");
  const [status, setStatus] = useState(sp.get("status") ?? "");
  const [project, setProject] = useState(sp.get("project") ?? "");

  const [selectedMarcas, setSelectedMarcas] = useState<string[]>(
    sp.get("marca")?.split(",").filter(Boolean) ?? []
  );
  const [marcasOpen, setMarcasOpen] = useState(false);
  const marcasContainerRef = useRef<HTMLDivElement>(null);

  function applyWith(overrides: Partial<{
    search: string; period: string; dateFrom: string; dateTo: string;
    marca: string; status: string; project: string;
  }>): void {
    const m = {
      search, period, dateFrom, dateTo, status, project,
      marca: selectedMarcas.join(","),
      ...overrides,
    };
    const params = new URLSearchParams();
    if (m.search) params.set("search", m.search);
    if (m.period) {
      params.set("period", m.period);
      if (m.period === "custom") {
        if (m.dateFrom) params.set("dateFrom", m.dateFrom);
        if (m.dateTo) params.set("dateTo", m.dateTo);
      }
    }
    if (m.marca) params.set("marca", m.marca);
    if (m.status) params.set("status", m.status);
    if (m.project) params.set("project", m.project);
    router.push(`/proformas?${params.toString()}`);
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
    setProject("");
    setSelectedMarcas([]);
    setMarcasOpen(false);
    router.push("/proformas");
  }

  const marcaLabel =
    selectedMarcas.length === 0
      ? "Todas"
      : selectedMarcas.length === 1
        ? (MARCA_ALL_OPTIONS.find((o) => o.value === selectedMarcas[0])?.label ?? selectedMarcas[0])
        : `${selectedMarcas.length} seleccionadas`;

  const hasFilters = search || period || status || project || selectedMarcas.length > 0;

  return (
    <div className="flex flex-wrap gap-3 items-end">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500 font-medium">Buscar</label>
        <input
          type="text"
          placeholder="Número, cliente…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") applyWith({ search }); }}
          onBlur={() => applyWith({ search })}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white min-w-[180px]"
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
        <label className="text-xs text-gray-500 font-medium">Estado Holded</label>
        <select
          value={status}
          onChange={(e) => { const v = e.target.value; setStatus(v); applyWith({ status: v }); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1" ref={marcasContainerRef}>
        <label className="text-xs text-gray-500 font-medium">Marca</label>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMarcasOpen((o) => !o)}
            className={`rounded-lg border px-3 py-2 text-sm bg-white text-left min-w-[11rem] flex items-center justify-between gap-2 transition-colors ${
              selectedMarcas.length > 0
                ? "border-indigo-500 text-indigo-700"
                : "border-gray-300 text-gray-700"
            }`}
          >
            <span className="truncate">{marcaLabel}</span>
            <ChevronIcon open={marcasOpen} />
          </button>
          {marcasOpen && (
            <div className="absolute top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[13rem]">
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

      {projects.length > 0 && (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">Proyecto</label>
          <select
            value={project}
            onChange={(e) => { const v = e.target.value; setProject(v); applyWith({ project: v }); }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white min-w-[11rem]"
          >
            <option value="">Todos</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}

      {hasFilters && (
        <button
          type="button"
          onClick={reset}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Limpiar
        </button>
      )}
    </div>
  );
}
