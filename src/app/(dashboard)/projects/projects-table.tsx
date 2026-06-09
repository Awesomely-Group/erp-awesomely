"use client";

import React, { useState, useMemo, useRef, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ProjectStatus } from "@prisma/client";
import { updateProjectStatus } from "./actions";
import { SortThClick } from "@/components/sort-th";
import type { TempoWorklogsMonthCostResponse } from "@/app/api/tempo/worklogs/route";

export interface ProjectRow {
  id: string;
  jiraKey: string;
  name: string;
  workspaceName: string;
  workspaceDomain: string;
  status: ProjectStatus;
  hasTempoToken: boolean;
  isPrecioCerrado: boolean;
  isBolsasHoras: boolean;
  isFeeRegular: boolean;
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

// ─── Month cost hook ──────────────────────────────────────────────────────────

interface MonthCostData {
  byMonth: Record<string, { hours: number; cost: number }>;
  totalHours: number;
  totalCost: number;
  estimateHours: number | null;
  estimateCost: number | null;
}

function useMonthCostData(
  projectId: string,
  hasTempoToken: boolean,
  from: string,
  to: string,
): { data: MonthCostData | null; loading: boolean } {
  const [data, setData] = useState<MonthCostData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!hasTempoToken) return;
    let cancelled = false;

    async function load(): Promise<void> {
      setLoading(true);
      setData(null);
      try {
        const res = await fetch(
          `/api/tempo/worklogs?projectId=${projectId}&from=${from}&to=${to}&groupBy=month-cost`
        );
        if (!res.ok) return;
        const d = (await res.json()) as TempoWorklogsMonthCostResponse;
        const byMonth: Record<string, { hours: number; cost: number }> = {};
        for (const m of d.months) byMonth[m.month] = { hours: m.totalHours, cost: m.totalCost };
        if (!cancelled) {
          setData({ byMonth, totalHours: d.totalHours, totalCost: d.totalCost, estimateHours: d.estimateHours, estimateCost: d.estimateCost });
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [projectId, hasTempoToken, from, to]);

  return { data, loading };
}

// ─── Project row ──────────────────────────────────────────────────────────────

interface ProjectRowProps {
  project: ProjectRow;
  months: MonthCol[];
  periodFrom: string;
  periodTo: string;
  showTotal: boolean;
}

function fmt(n: number): string {
  return n.toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + "€";
}

function ProjectTableRow({
  project,
  months,
  periodFrom,
  periodTo,
  showTotal,
}: ProjectRowProps): React.JSX.Element {
  const router = useRouter();
  const { data, loading } = useMonthCostData(project.id, project.hasTempoToken, periodFrom, periodTo);

  const dash = <span className="text-gray-300">—</span>;
  const spin = <span className="text-gray-300 animate-pulse text-xs">…</span>;

  function hoursCell(key: string): React.JSX.Element {
    if (!project.hasTempoToken) return dash;
    if (loading) return spin;
    const h = data?.byMonth[key]?.hours;
    return h != null && h > 0 ? <span className="text-gray-900">{h}h</span> : dash;
  }

  function costCell(key: string): React.JSX.Element {
    if (!project.hasTempoToken) return dash;
    if (loading) return spin;
    const c = data?.byMonth[key]?.cost;
    return c != null && c > 0 ? <span className="text-indigo-600 tabular-nums">{fmt(c)}</span> : dash;
  }

  function totalHoursCell(): React.JSX.Element {
    if (!project.hasTempoToken) return dash;
    if (loading) return spin;
    if (!data || data.totalHours === 0) return dash;
    const overBudget = data.estimateHours != null && data.totalHours > data.estimateHours;
    return <span className={`font-semibold ${overBudget ? "text-red-600" : "text-gray-900"}`}>{data.totalHours}h</span>;
  }

  function totalCostCell(): React.JSX.Element {
    if (!project.hasTempoToken) return dash;
    if (loading) return spin;
    if (!data || data.totalCost === 0) return dash;
    const overBudget = data.estimateCost != null && data.totalCost > data.estimateCost;
    return <span className={`font-semibold tabular-nums ${overBudget ? "text-red-600" : "text-indigo-600"}`}>{fmt(data.totalCost)}</span>;
  }

  function estHoursCell(): React.JSX.Element {
    if (!project.hasTempoToken) return dash;
    if (loading) return spin;
    return data?.estimateHours != null && data.estimateHours > 0
      ? <span className="text-gray-500">{data.estimateHours}h</span>
      : dash;
  }

  function estCostCell(): React.JSX.Element {
    if (!project.hasTempoToken) return dash;
    if (loading) return spin;
    return data?.estimateCost != null && data.estimateCost > 0
      ? <span className="text-gray-400 tabular-nums">{fmt(data.estimateCost)}</span>
      : dash;
  }

  return (
    <tr
      className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors cursor-pointer"
      onClick={() => router.push(`/projects/${project.id}`)}
    >
      <td className="px-4 py-3">
        <span className="font-mono text-xs bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">
          {project.jiraKey}
        </span>
      </td>
      <td className="px-4 py-3">
        <p className="font-medium text-gray-900">{project.name}</p>
        {(project.isPrecioCerrado || project.isBolsasHoras || project.isFeeRegular) && (
          <div className="flex gap-1 mt-1 flex-wrap">
            {project.isPrecioCerrado && (
              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">PC</span>
            )}
            {project.isBolsasHoras && (
              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700">BH</span>
            )}
            {project.isFeeRegular && (
              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-700">FR</span>
            )}
          </div>
        )}
      </td>
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <StatusBadge projectId={project.id} status={project.status} />
      </td>

      {months.map((m) => (
        <React.Fragment key={m.key}>
          <td className="px-3 py-3 text-right tabular-nums text-sm">{hoursCell(m.key)}</td>
          <td className="px-2 py-3 text-right tabular-nums text-sm">{costCell(m.key)}</td>
        </React.Fragment>
      ))}

      {showTotal && (
        <>
          <td className="px-3 py-3 text-right tabular-nums text-sm border-l border-gray-100">{totalHoursCell()}</td>
          <td className="px-2 py-3 text-right tabular-nums text-sm">{totalCostCell()}</td>
        </>
      )}

      <td className="px-3 py-3 text-right tabular-nums text-sm border-l border-gray-100">{estHoursCell()}</td>
      <td className="px-2 py-3 text-right tabular-nums text-sm">{estCostCell()}</td>

      <td className="px-4 py-3">
        <svg
          className="w-4 h-4 text-gray-400"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </td>
    </tr>
  );
}

// ─── Main table ───────────────────────────────────────────────────────────────

interface Props {
  allProjects: ProjectRow[];
  pageTitle?: string;
  pageSubtitle?: string;
}

export function ProjectsTable({ allProjects, pageTitle, pageSubtitle }: Props): React.JSX.Element {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<ProjectStatus | "">(ProjectStatus.ONGOING);
  const [periodType, setPeriodType] = useState<PeriodType>("month");
  const [periodOffset, setPeriodOffset] = useState(0);
  const [sortKey, setSortKey] = useState<"jiraKey" | "name" | "status">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function handleSort(col: "jiraKey" | "name" | "status"): void {
    if (sortKey === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col);
      setSortDir("asc");
    }
  }

  const { from: periodFrom, to: periodTo } = getPeriodRange(periodType, periodOffset);
  const months = useMemo(
    () => getMonthsForPeriod(periodType, periodOffset),
    [periodType, periodOffset],
  );
  const showTotal = months.length > 1;
  // 3 fixed + month cols×2 (h+€) + optional Total×2 + Est×2 + gear + arrow
  const totalCols = 3 + months.length * 2 + (showTotal ? 2 : 0) + 2 + 1 + 1;

  const workspaceTabs = useMemo(() => {
    const seen = new Set<string>();
    const tabs: string[] = [];
    for (const p of allProjects) {
      if (!seen.has(p.workspaceName)) { seen.add(p.workspaceName); tabs.push(p.workspaceName); }
    }
    return tabs;
  }, [allProjects]);

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allProjects.length };
    for (const ws of workspaceTabs) {
      counts[ws] = allProjects.filter((p) => p.workspaceName === ws).length;
    }
    return counts;
  }, [allProjects, workspaceTabs]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const base = allProjects.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q) && !p.jiraKey.toLowerCase().includes(q)) {
        return false;
      }
      if (activeTab !== "all" && p.workspaceName !== activeTab) return false;
      if (filterStatus && p.status !== filterStatus) return false;
      return true;
    });
    return [...base].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "jiraKey") cmp = a.jiraKey.localeCompare(b.jiraKey);
      else if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "status") cmp = a.status.localeCompare(b.status);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [allProjects, search, activeTab, filterStatus, sortKey, sortDir]);

  return (
    <div className="space-y-4">
      {/* Header with filters top-right */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          {pageTitle && <h1 className="text-2xl font-bold text-gray-900">{pageTitle}</h1>}
          {pageSubtitle && <p className="text-sm text-gray-500 mt-1">{pageSubtitle}</p>}
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500 font-medium">Buscar</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nombre o clave..."
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-w-[200px]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500 font-medium">Estado</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as ProjectStatus | "")}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">Todos</option>
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
          {(search || filterStatus !== ProjectStatus.ONGOING) && (
            <button
              type="button"
              onClick={() => { setSearch(""); setFilterStatus(ProjectStatus.ONGOING); }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors self-end"
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Workspace tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {[{ key: "all", label: "Todos" }, ...workspaceTabs.map((ws) => ({ key: ws, label: ws }))].map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap border-b-2 -mb-px ${
              activeTab === key
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            {label}
            <span className={`ml-1.5 text-xs ${activeTab === key ? "text-indigo-400" : "text-gray-400"}`}>
              {tabCounts[key] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Count + Period selector */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">
          {filtered.length} de {allProjects.length} proyectos
        </span>
        <PeriodSelector
          periodType={periodType}
          periodOffset={periodOffset}
          onTypeChange={setPeriodType}
          onOffsetChange={setPeriodOffset}
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <SortThClick label="Clave" active={sortKey === "jiraKey"} sortDir={sortDir} onClick={() => handleSort("jiraKey")} className="whitespace-nowrap" />
              <SortThClick label="Proyecto" active={sortKey === "name"} sortDir={sortDir} onClick={() => handleSort("name")} className="whitespace-nowrap" />
              <SortThClick label="Estado" active={sortKey === "status"} sortDir={sortDir} onClick={() => handleSort("status")} className="whitespace-nowrap" />
              {months.map((m) => (
                <React.Fragment key={m.key}>
                  <th className="px-3 py-3 text-right font-medium text-gray-600 whitespace-nowrap capitalize">
                    {m.label}
                  </th>
                  <th className="px-2 py-3 text-right font-medium text-indigo-400 whitespace-nowrap text-xs">
                    €
                  </th>
                </React.Fragment>
              ))}
              {showTotal && (
                <>
                  <th className="px-3 py-3 text-right font-medium text-gray-600 whitespace-nowrap border-l border-gray-100">Total</th>
                  <th className="px-2 py-3 text-right font-medium text-indigo-400 whitespace-nowrap text-xs">€</th>
                </>
              )}
              <th className="px-3 py-3 text-right font-medium text-gray-400 whitespace-nowrap text-xs border-l border-gray-100">Est. h</th>
              <th className="px-2 py-3 text-right font-medium text-gray-400 whitespace-nowrap text-xs">Est. €</th>
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
