"use client";

import { useState, useMemo, useRef, useEffect, useTransition } from "react";
import { ProjectStatus } from "@prisma/client";
import { updateProjectStatus } from "./actions";
import type { TempoWorklogsMonthlyResponse } from "@/app/api/tempo/worklogs/route";

export interface ProjectRow {
  id: string;
  jiraKey: string;
  name: string;
  workspaceName: string;
  workspaceDomain: string;
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

interface MonthCol {
  key: string; // "2025-01"
  label: string;
  from: string;
  to: string;
}

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

  const year = now.getFullYear() + offset;
  return {
    from: `${year}-01-01`,
    to: `${year}-12-31`,
    label: String(year),
  };
}

function getMonthsForPeriod(type: PeriodType, offset: number): MonthCol[] {
  const now = new Date();

  if (type === "month") {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const year = d.getFullYear();
    const m = d.getMonth() + 1;
    const key = `${year}-${String(m).padStart(2, "0")}`;
    return [{
      key,
      label: d.toLocaleDateString("es-ES", { month: "short", year: "numeric" }),
      from: `${year}-${String(m).padStart(2, "0")}-01`,
      to: `${year}-${String(m).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`,
    }];
  }

  if (type === "quarter") {
    const currentQ = Math.floor(now.getMonth() / 3);
    const totalQ = currentQ + offset;
    const year = now.getFullYear() + Math.floor(totalQ / 4);
    const q = ((totalQ % 4) + 4) % 4;
    const startMonth = q * 3;
    return [0, 1, 2].map((i) => {
      const month = startMonth + i;
      const d = new Date(year, month, 1);
      const last = new Date(year, month + 1, 0);
      const m = month + 1;
      return {
        key: `${year}-${String(m).padStart(2, "0")}`,
        label: d.toLocaleDateString("es-ES", { month: "short" }),
        from: `${year}-${String(m).padStart(2, "0")}-01`,
        to: `${year}-${String(m).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`,
      };
    });
  }

  const year = now.getFullYear() + offset;
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(year, i, 1);
    const last = new Date(year, i + 1, 0);
    const m = i + 1;
    return {
      key: `${year}-${String(m).padStart(2, "0")}`,
      label: d.toLocaleDateString("es-ES", { month: "short" }),
      from: `${year}-${String(m).padStart(2, "0")}-01`,
      to: `${year}-${String(m).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`,
    };
  });
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

// ─── Monthly hours hook ───────────────────────────────────────────────────────

interface MonthlyHoursData {
  byMonth: Record<string, number>;
  totalHours: number;
}

function useMonthlyHours(
  projectId: string,
  hasTempoToken: boolean,
  from: string,
  to: string,
): { data: MonthlyHoursData | null; loading: boolean; error: string | null } {
  const [data, setData] = useState<MonthlyHoursData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasTempoToken) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    async function load(): Promise<void> {
      try {
        const res = await fetch(
          `/api/tempo/worklogs?projectId=${projectId}&from=${from}&to=${to}&groupBy=month`
        );
        const text = await res.text();
        let parsed: unknown;
        try { parsed = JSON.parse(text); } catch { throw new Error(`Error ${res.status}`); }
        if (!res.ok) throw new Error((parsed as { error?: string }).error ?? `Error ${res.status}`);
        const monthly = parsed as TempoWorklogsMonthlyResponse;
        const byMonth: Record<string, number> = {};
        for (const m of monthly.months) {
          byMonth[m.month] = m.totalHours;
        }
        if (!cancelled) {
          setData({ byMonth, totalHours: monthly.totalHours });
          setLoading(false);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Error desconocido");
          setLoading(false);
        }
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [projectId, hasTempoToken, from, to]);

  return { data, loading, error };
}

// ─── Expanded row with estimated vs. realized hours ──────────────────────────

interface IssueHoursEntry {
  issueKey: string;
  summary: string;
  assigneeName: string | null;
  originalEstimateHours: number | null;
  spentHours: number;
}

interface IssueHoursResponse {
  issues: IssueHoursEntry[];
  totalSpentHours: number;
  totalEstimateHours: number;
}

interface ExpandedRowProps {
  projectId: string;
  hasTempoToken: boolean;
  from: string;
  to: string;
  totalCols: number;
  workspaceDomain: string;
}

function ExpandedRow({ projectId, hasTempoToken, from, to, totalCols, workspaceDomain }: ExpandedRowProps): React.JSX.Element {
  const [data, setData] = useState<IssueHoursResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasTempoToken) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    async function load(): Promise<void> {
      try {
        const res = await fetch(`/api/tempo/worklogs?projectId=${projectId}&from=${from}&to=${to}&groupBy=issue`);
        const text = await res.text();
        let parsed: unknown;
        try { parsed = JSON.parse(text); } catch { throw new Error(`Error ${res.status}`); }
        if (!res.ok) throw new Error((parsed as { error?: string }).error ?? `Error ${res.status}`);
        if (!cancelled) { setData(parsed as IssueHoursResponse); setLoading(false); }
      } catch (e: unknown) {
        if (!cancelled) { setError(e instanceof Error ? e.message : "Error desconocido"); setLoading(false); }
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [projectId, hasTempoToken, from, to]);

  return (
    <tr className="bg-indigo-50/40 border-b border-gray-100">
      <td colSpan={totalCols} className="px-6 py-3">
        {!hasTempoToken && (
          <p className="text-xs text-gray-400">
            Token de Tempo no configurado.{" "}
            <a href="/settings" className="text-indigo-600 hover:underline">Configúralo en Configuración</a>.
          </p>
        )}

        {hasTempoToken && loading && (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            Cargando tareas...
          </div>
        )}

        {hasTempoToken && error && (
          <p className="text-xs text-red-500">Error: {error}</p>
        )}

        {hasTempoToken && data && data.issues.length === 0 && (
          <p className="text-xs text-gray-400">Sin tareas con horas en este período.</p>
        )}

        {hasTempoToken && data && data.issues.length > 0 && (
          <div className="max-h-64 overflow-y-auto">
            <table className="text-xs w-full">
              <thead className="sticky top-0 bg-indigo-50">
                <tr className="text-gray-500">
                  <th className="text-left font-medium pb-1.5 pr-4">Tarea</th>
                  <th className="text-left font-medium pb-1.5 pr-6">Resumen</th>
                  <th className="text-left font-medium pb-1.5 pr-6">Persona</th>
                  <th className="text-right font-medium pb-1.5 pr-4">Estimado</th>
                  <th className="text-right font-medium pb-1.5">Realizado</th>
                </tr>
              </thead>
              <tbody>
                {data.issues.map((issue) => (
                  <tr key={issue.issueKey} className="border-t border-gray-100">
                    <td className="py-1 pr-4">
                      <a
                        href={`https://${workspaceDomain}/browse/${issue.issueKey}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono bg-gray-100 text-indigo-700 hover:bg-indigo-100 px-1 py-0.5 rounded transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {issue.issueKey}
                      </a>
                    </td>
                    <td className="py-1 pr-6 text-gray-700 max-w-[220px] truncate">{issue.summary}</td>
                    <td className="py-1 pr-6 text-gray-500">{issue.assigneeName ?? "—"}</td>
                    <td className="py-1 pr-4 text-right tabular-nums text-gray-400">
                      {issue.originalEstimateHours != null ? `${issue.originalEstimateHours}h` : "—"}
                    </td>
                    <td className="py-1 text-right tabular-nums text-gray-700">{issue.spentHours}h</td>
                  </tr>
                ))}
                <tr className="border-t border-gray-300 font-semibold">
                  <td colSpan={3} className="pt-1.5 text-gray-900">Total</td>
                  <td className="pt-1.5 pr-4 text-right tabular-nums text-gray-400">
                    {data.totalEstimateHours > 0 ? `${data.totalEstimateHours}h` : "—"}
                  </td>
                  <td className="pt-1.5 text-right tabular-nums text-gray-900">{data.totalSpentHours}h</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </td>
    </tr>
  );
}

// ─── Project row ──────────────────────────────────────────────────────────────

interface ProjectRowProps {
  project: ProjectRow;
  months: MonthCol[];
  periodFrom: string;
  periodTo: string;
  showTotal: boolean;
  isExpanded: boolean;
  totalCols: number;
  onToggleExpand: (id: string) => void;
}

function ProjectTableRow({
  project,
  months,
  periodFrom,
  periodTo,
  showTotal,
  isExpanded,
  totalCols,
  onToggleExpand,
}: ProjectRowProps): React.JSX.Element {
  const { data, loading } = useMonthlyHours(project.id, project.hasTempoToken, periodFrom, periodTo);

  function renderHoursCell(monthKey: string): React.JSX.Element {
    if (!project.hasTempoToken) {
      return <span className="text-gray-300">—</span>;
    }
    if (loading) {
      return <span className="text-gray-300 animate-pulse text-xs">…</span>;
    }
    if (data) {
      const h = data.byMonth[monthKey];
      return h != null && h > 0
        ? <span className="text-gray-900">{h}h</span>
        : <span className="text-gray-300">—</span>;
    }
    return <span className="text-gray-300">—</span>;
  }

  function renderTotalCell(): React.JSX.Element {
    if (!project.hasTempoToken) return <span className="text-gray-300">—</span>;
    if (loading) return <span className="text-gray-300 animate-pulse text-xs">…</span>;
    if (data) {
      return data.totalHours > 0
        ? <span className="text-gray-900 font-semibold">{data.totalHours}h</span>
        : <span className="text-gray-300">—</span>;
    }
    return <span className="text-gray-300">—</span>;
  }

  return (
    <>
      <tr
        className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors cursor-pointer"
        onClick={() => onToggleExpand(project.id)}
      >
        <td className="px-4 py-3">
          <span className="font-mono text-xs bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">
            {project.jiraKey}
          </span>
        </td>
        <td className="px-4 py-3 font-medium text-gray-900">{project.name}</td>
        <td className="px-4 py-3 text-gray-500">{project.workspaceName}</td>
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <StatusBadge projectId={project.id} status={project.status} />
        </td>

        {months.map((m) => (
          <td key={m.key} className="px-3 py-3 text-right tabular-nums text-sm">
            {renderHoursCell(m.key)}
          </td>
        ))}

        {showTotal && (
          <td className="px-3 py-3 text-right tabular-nums text-sm border-l border-gray-100">
            {renderTotalCell()}
          </td>
        )}

        <td className="px-4 py-3">
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </td>
      </tr>

      {isExpanded && (
        <ExpandedRow
          projectId={project.id}
          hasTempoToken={project.hasTempoToken}
          from={periodFrom}
          to={periodTo}
          totalCols={totalCols}
          workspaceDomain={project.workspaceDomain}
        />
      )}
    </>
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

  const { from: periodFrom, to: periodTo } = getPeriodRange(periodType, periodOffset);
  const months = useMemo(
    () => getMonthsForPeriod(periodType, periodOffset),
    [periodType, periodOffset],
  );
  const showTotal = months.length > 1;
  // 4 fixed + month cols + optional Total + expand arrow
  const totalCols = 4 + months.length + (showTotal ? 1 : 0) + 1;

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

  return (
    <div className="space-y-4">
      {/* Filters */}
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
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap">Clave</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap">Proyecto</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap">Marca</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap">Estado</th>
              {months.map((m) => (
                <th key={m.key} className="px-3 py-3 text-right font-medium text-gray-600 whitespace-nowrap capitalize">
                  {m.label}
                </th>
              ))}
              {showTotal && (
                <th className="px-3 py-3 text-right font-medium text-gray-600 whitespace-nowrap border-l border-gray-100">
                  Total
                </th>
              )}
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((project) => (
              <ProjectTableRow
                key={project.id}
                project={project}
                months={months}
                periodFrom={periodFrom}
                periodTo={periodTo}
                showTotal={showTotal}
                isExpanded={expandedId === project.id}
                totalCols={totalCols}
                onToggleExpand={(id) => setExpandedId((prev) => (prev === id ? null : id))}
              />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={totalCols} className="px-4 py-8 text-center text-gray-400">
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
