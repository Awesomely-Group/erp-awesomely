"use client";

import { useState, useMemo, useRef, useEffect, useTransition } from "react";
import { ProjectStatus } from "@prisma/client";
import { updateProjectStatus } from "./actions";
import type { TempoWorklogsResponse } from "@/app/api/tempo/worklogs/route";

export interface ProjectRow {
  id: string;
  jiraKey: string;
  name: string;
  workspaceName: string;
  status: ProjectStatus;
  hasTempoToken: boolean;
}

const STATUS_LABELS: Record<ProjectStatus, string> = {
  NOT_STARTED: "Sin iniciar",
  ONGOING: "En curso",
  PAUSED: "Pausado",
  DONE: "Completado",
  ARCHIVED: "Archivado",
};

const STATUS_CLASSES: Record<ProjectStatus, string> = {
  NOT_STARTED: "bg-gray-100 text-gray-600",
  ONGOING: "bg-blue-100 text-blue-700",
  PAUSED: "bg-amber-100 text-amber-700",
  DONE: "bg-green-100 text-green-700",
  ARCHIVED: "bg-red-100 text-red-600",
};

const ALL_STATUSES = Object.values(ProjectStatus) as ProjectStatus[];

type PeriodType = "month" | "quarter" | "year";

function getPeriodRange(
  type: PeriodType,
  offset: number
): { from: string; to: string; label: string } {
  const now = new Date();

  if (type === "month") {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const to = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
    const label = d.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
    return { from, to, label: label.charAt(0).toUpperCase() + label.slice(1) };
  }

  if (type === "quarter") {
    const currentQ = Math.floor(now.getMonth() / 3);
    const totalQ = currentQ + offset;
    const year = now.getFullYear() + Math.floor(totalQ / 4);
    const q = ((totalQ % 4) + 4) % 4;
    const startMonth = q * 3;
    const endMonth = startMonth + 2;
    const from = `${year}-${String(startMonth + 1).padStart(2, "0")}-01`;
    const last = new Date(year, endMonth + 1, 0);
    const to = `${year}-${String(endMonth + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
    return { from, to, label: `Q${q + 1} ${year}` };
  }

  // year
  const year = now.getFullYear() + offset;
  return {
    from: `${year}-01-01`,
    to: `${year}-12-31`,
    label: String(year),
  };
}

// ─── Status badge ─────────────────────────────────────────────────────────────

interface StatusBadgeProps {
  projectId: string;
  status: ProjectStatus;
}

function StatusBadge({ projectId, status }: StatusBadgeProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [optimisticStatus, setOptimisticStatus] = useState<ProjectStatus>(status);
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOptimisticStatus(status);
  }, [status]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function handleSelect(newStatus: ProjectStatus): void {
    setOpen(false);
    setOptimisticStatus(newStatus);
    startTransition(async () => {
      await updateProjectStatus(projectId, newStatus);
    });
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium transition-opacity cursor-pointer ${STATUS_CLASSES[optimisticStatus]} ${isPending ? "opacity-60" : "hover:opacity-80"}`}
      >
        {STATUS_LABELS[optimisticStatus]}
        <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[140px]">
          {ALL_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => handleSelect(s)}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors flex items-center gap-2 ${s === optimisticStatus ? "font-semibold" : ""}`}
            >
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${STATUS_CLASSES[s]}`}>
                {STATUS_LABELS[s]}
              </span>
              {s === optimisticStatus && (
                <svg className="w-3 h-3 text-indigo-600 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Period selector ──────────────────────────────────────────────────────────

interface PeriodSelectorProps {
  periodType: PeriodType;
  periodOffset: number;
  onTypeChange: (t: PeriodType) => void;
  onOffsetChange: (o: number) => void;
}

const PERIOD_LABELS: Record<PeriodType, string> = {
  month: "Mes",
  quarter: "Trimestre",
  year: "Año",
};

function PeriodSelector({ periodType, periodOffset, onTypeChange, onOffsetChange }: PeriodSelectorProps): React.JSX.Element {
  const { label } = getPeriodRange(periodType, periodOffset);

  return (
    <div className="flex items-center gap-2">
      <div className="flex rounded-lg border border-gray-300 overflow-hidden text-xs">
        {(["month", "quarter", "year"] as PeriodType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => { onTypeChange(t); onOffsetChange(0); }}
            className={`px-3 py-1.5 font-medium transition-colors ${
              periodType === t
                ? "bg-indigo-600 text-white"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {PERIOD_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onOffsetChange(periodOffset - 1)}
          className="p-1 rounded hover:bg-gray-100 text-gray-500 transition-colors"
          aria-label="Período anterior"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-sm font-medium text-gray-700 min-w-[110px] text-center">{label}</span>
        <button
          type="button"
          onClick={() => onOffsetChange(periodOffset + 1)}
          disabled={periodOffset >= 0}
          className="p-1 rounded hover:bg-gray-100 text-gray-500 transition-colors disabled:opacity-30"
          aria-label="Período siguiente"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── Expanded row with Tempo hours ────────────────────────────────────────────

interface ExpandedRowProps {
  projectId: string;
  hasTempoToken: boolean;
  from: string;
  to: string;
}

function ExpandedRow({ projectId, hasTempoToken, from, to }: ExpandedRowProps): React.JSX.Element {
  const [data, setData] = useState<TempoWorklogsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasTempoToken) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    fetch(`/api/tempo/worklogs?projectId=${projectId}&from=${from}&to=${to}`)
      .then(async (res) => {
        const text = await res.text();
        let parsed: unknown;
        try { parsed = JSON.parse(text); } catch { throw new Error(`Error ${res.status}`); }
        if (!res.ok) {
          throw new Error((parsed as { error?: string }).error ?? `Error ${res.status}`);
        }
        return parsed as TempoWorklogsResponse;
      })
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Error desconocido");
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [projectId, hasTempoToken, from, to]);

  return (
    <tr className="bg-indigo-50/40 border-b border-gray-100">
      <td colSpan={5} className="px-6 py-3">
        {!hasTempoToken && (
          <p className="text-xs text-gray-400">
            Token de Tempo no configurado.{" "}
            <a href="/settings" className="text-indigo-600 hover:underline">
              Configúralo en Configuración
            </a>
            .
          </p>
        )}

        {hasTempoToken && loading && (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            Cargando horas...
          </div>
        )}

        {hasTempoToken && error && (
          <p className="text-xs text-red-500">Error al cargar horas: {error}</p>
        )}

        {hasTempoToken && data && data.users.length === 0 && (
          <p className="text-xs text-gray-400">Sin horas registradas en este período.</p>
        )}

        {hasTempoToken && data && data.users.length > 0 && (
          <table className="text-xs w-auto min-w-[280px]">
            <thead>
              <tr className="text-gray-500">
                <th className="text-left font-medium pb-1 pr-8">Persona</th>
                <th className="text-right font-medium pb-1">Horas</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u.accountId} className="border-t border-gray-100">
                  <td className="py-1 pr-8 text-gray-700">{u.displayName}</td>
                  <td className="py-1 text-right tabular-nums text-gray-700">{u.hours}h</td>
                </tr>
              ))}
              <tr className="border-t border-gray-300 font-semibold">
                <td className="pt-1.5 pr-8 text-gray-900">Total</td>
                <td className="pt-1.5 text-right tabular-nums text-gray-900">{data.totalHours}h</td>
              </tr>
            </tbody>
          </table>
        )}
      </td>
    </tr>
  );
}

// ─── Main table ───────────────────────────────────────────────────────────────

interface Props {
  allProjects: ProjectRow[];
}

export function ProjectsTable({ allProjects }: Props): React.JSX.Element {
  const [search, setSearch] = useState("");
  const [filterBrand, setFilterBrand] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<ProjectStatus | "">("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [periodType, setPeriodType] = useState<PeriodType>("month");
  const [periodOffset, setPeriodOffset] = useState(0);

  const { from, to } = getPeriodRange(periodType, periodOffset);

  const brandOptions = useMemo(() => {
    const names = Array.from(new Set(allProjects.map((p) => p.workspaceName)));
    return names.sort((a, b) => a.localeCompare(b));
  }, [allProjects]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return allProjects.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q) && !p.jiraKey.toLowerCase().includes(q)) {
        return false;
      }
      if (filterBrand && p.workspaceName !== filterBrand) return false;
      if (filterStatus && p.status !== filterStatus) return false;
      return true;
    });
  }, [allProjects, search, filterBrand, filterStatus]);

  function toggleExpand(id: string): void {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="space-y-4">
      {/* Filters + period selector */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o clave..."
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-w-[220px]"
        />

        <select
          value={filterBrand}
          onChange={(e) => setFilterBrand(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option value="">Todas las marcas</option>
          {brandOptions.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as ProjectStatus | "")}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option value="">Todos los estados</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>

        {(search || filterBrand || filterStatus) && (
          <button
            type="button"
            onClick={() => { setSearch(""); setFilterBrand(""); setFilterStatus(""); }}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Limpiar filtros
          </button>
        )}

        <span className="ml-auto text-xs text-gray-400">
          {filtered.length} de {allProjects.length} proyectos
        </span>
      </div>

      {/* Period selector */}
      <PeriodSelector
        periodType={periodType}
        periodOffset={periodOffset}
        onTypeChange={setPeriodType}
        onOffsetChange={setPeriodOffset}
      />

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-3 text-left font-medium text-gray-600">Clave</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Proyecto</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Marca</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Estado</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Horas</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((project) => (
              <>
                <tr
                  key={project.id}
                  className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => toggleExpand(project.id)}
                >
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">
                      {project.jiraKey}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{project.name}</td>
                  <td className="px-4 py-3 text-gray-500">{project.workspaceName}</td>
                  <td
                    className="px-4 py-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <StatusBadge projectId={project.id} status={project.status} />
                  </td>
                  <td className="px-4 py-3">
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform ${expandedId === project.id ? "rotate-90" : ""}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </td>
                </tr>
                {expandedId === project.id && (
                  <ExpandedRow
                    key={`${project.id}-expanded`}
                    projectId={project.id}
                    hasTempoToken={project.hasTempoToken}
                    from={from}
                    to={to}
                  />
                )}
              </>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  {allProjects.length === 0
                    ? "Sin proyectos sincronizados"
                    : "Sin resultados para los filtros aplicados"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
