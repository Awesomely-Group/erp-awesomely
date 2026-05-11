"use client";

import React, { useState, useEffect } from "react";

// ─── Period helpers (same logic as projects-table) ────────────────────────────

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

  const year = now.getFullYear() + offset;
  return { from: `${year}-01-01`, to: `${year}-12-31`, label: String(year) };
}

const PERIOD_LABELS: Record<PeriodType, string> = {
  month: "Mes",
  quarter: "Trimestre",
  year: "Año",
};

// ─── Period selector ──────────────────────────────────────────────────────────

interface PeriodSelectorProps {
  periodType: PeriodType;
  periodOffset: number;
  onTypeChange: (t: PeriodType) => void;
  onOffsetChange: (o: number) => void;
}

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

// ─── Hierarchical timesheet ───────────────────────────────────────────────────

interface WorklogDetail { description: string; issueKey: string; hours: number; }
interface IssueWithWorklogs { issueKey: string; summary: string; totalHours: number; originalEstimateHours: number | null; worklogs: WorklogDetail[]; actualCostEur: number; estimatedCostEur: number | null; }
interface UserWithIssues { accountId: string; displayName: string; totalHours: number; ratePerHour: number; actualCostEur: number; estimatedCostEur: number | null; issues: IssueWithWorklogs[]; }
interface HierarchicalHoursResponse { users: UserWithIssues[]; totalHours: number; totalEstimateHours: number; totalActualCostEur: number; totalEstimatedCostEur: number; }

function formatEur(amount: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(amount);
}

function IssueIcon(): React.JSX.Element {
  return (
    <svg className="w-4 h-4 flex-shrink-0 text-blue-500" viewBox="0 0 16 16" fill="none">
      <rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4.5 8.5l2 2L11.5 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WorklogIcon(): React.JSX.Element {
  return (
    <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 16 16">
      <rect width="16" height="16" rx="3" fill="#22c55e" />
      <path d="M4.5 8.5l2 2L11.5 5.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

interface HierarchicalTableProps {
  projectId: string;
  hasTempoToken: boolean;
  from: string;
  to: string;
  workspaceDomain: string;
}

function HierarchicalTable({ projectId, hasTempoToken, from, to, workspaceDomain }: HierarchicalTableProps): React.JSX.Element {
  const [data, setData] = useState<HierarchicalHoursResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsedUsers, setCollapsedUsers] = useState<Set<string>>(new Set());

  function toggleUser(accountId: string): void {
    setCollapsedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  }

  useEffect(() => {
    if (!hasTempoToken) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    async function load(): Promise<void> {
      try {
        const res = await fetch(
          `/api/tempo/worklogs?projectId=${projectId}&from=${from}&to=${to}&groupBy=hierarchical`
        );
        const text = await res.text();
        let parsed: unknown;
        try { parsed = JSON.parse(text); } catch { throw new Error(`Error ${res.status}`); }
        if (!res.ok) throw new Error((parsed as { error?: string }).error ?? `Error ${res.status}`);
        if (!cancelled) { setData(parsed as HierarchicalHoursResponse); setLoading(false); }
      } catch (e: unknown) {
        if (!cancelled) { setError(e instanceof Error ? e.message : "Error desconocido"); setLoading(false); }
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [projectId, hasTempoToken, from, to]);

  if (!hasTempoToken) {
    return (
      <p className="text-sm text-gray-400">
        Token de Tempo no configurado.{" "}
        <a href="/settings" className="text-indigo-600 hover:underline">Configúralo en Configuración</a>.
      </p>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        Cargando timesheet...
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-red-500 py-4">Error: {error}</p>;
  }

  if (!data || data.users.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 px-4 py-10 text-center text-sm text-gray-400">
        Sin horas registradas en este período
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="px-4 py-3 text-left font-medium text-gray-600">Usuario / Tarea / Worklog</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600 w-28">Key</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600 w-24">Est. h</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600 w-20">Real h</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600 w-28">Coste Est.</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600 w-28">Coste Real</th>
          </tr>
        </thead>
        <tbody>
          {data.users.map((user) => {
            const collapsed = collapsedUsers.has(user.accountId);
            return (
              <React.Fragment key={user.accountId}>
                <tr
                  className="border-t border-gray-200 bg-indigo-50/30 cursor-pointer select-none hover:bg-indigo-50/60 transition-colors"
                  onClick={() => toggleUser(user.accountId)}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <svg
                        className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${collapsed ? "-rotate-90" : ""}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                      <div className="w-6 h-6 rounded-full bg-indigo-500 text-white flex items-center justify-center text-[11px] font-bold flex-shrink-0">
                        {user.displayName[0]?.toUpperCase() ?? "?"}
                      </div>
                      <span className="font-semibold text-gray-900">{user.displayName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5" />
                  <td className="px-4 py-2.5" />
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-900">{user.totalHours}h</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-400 font-semibold">
                    {user.estimatedCostEur != null ? formatEur(user.estimatedCostEur) : "—"}
                  </td>
                  <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${
                    user.estimatedCostEur != null && user.actualCostEur > user.estimatedCostEur
                      ? "text-red-600"
                      : "text-gray-900"
                  }`}>
                    {user.ratePerHour > 0 ? formatEur(user.actualCostEur) : "—"}
                  </td>
                </tr>

                {!collapsed && user.issues.map((issue) => (
                  <React.Fragment key={`${user.accountId}-${issue.issueKey}`}>
                    <tr className="border-t border-gray-100">
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2 pl-8">
                          <IssueIcon />
                          <span className="text-gray-700 truncate max-w-[320px]">{issue.summary}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <a
                          href={`https://${workspaceDomain}/browse/${issue.issueKey}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:text-indigo-800 font-mono text-xs"
                        >
                          {issue.issueKey}
                        </a>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-400">
                        {issue.originalEstimateHours != null ? `${issue.originalEstimateHours}h` : "—"}
                      </td>
                      <td className={`px-4 py-2 text-right tabular-nums ${
                        issue.originalEstimateHours != null && issue.totalHours > issue.originalEstimateHours
                          ? "text-red-600 font-semibold"
                          : "text-gray-700"
                      }`}>{issue.totalHours}h</td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-400">
                        {issue.estimatedCostEur != null ? formatEur(issue.estimatedCostEur) : "—"}
                      </td>
                      <td className={`px-4 py-2 text-right tabular-nums ${
                        issue.estimatedCostEur != null && issue.actualCostEur > issue.estimatedCostEur
                          ? "text-red-600 font-semibold"
                          : "text-gray-700"
                      }`}>
                        {issue.actualCostEur > 0 ? formatEur(issue.actualCostEur) : "—"}
                      </td>
                    </tr>

                    {issue.worklogs.map((wl, wi) => (
                      <tr key={`${user.accountId}-${issue.issueKey}-${wi}`} className="border-t border-gray-50">
                        <td className="px-4 py-1.5">
                          <div className="flex items-center gap-2 pl-16">
                            <WorklogIcon />
                            <span className="text-gray-500 truncate max-w-[280px]">{wl.description}</span>
                          </div>
                        </td>
                        <td className="px-4 py-1.5">
                          <a
                            href={`https://${workspaceDomain}/browse/${wl.issueKey}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-600 hover:text-indigo-800 font-mono text-xs"
                          >
                            {wl.issueKey}
                          </a>
                        </td>
                        <td className="px-4 py-1.5" />
                        <td className="px-4 py-1.5 text-right tabular-nums text-gray-500">{wl.hours}h</td>
                        <td className="px-4 py-1.5" />
                        <td className="px-4 py-1.5" />
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </React.Fragment>
            );
          })}

          <tr className="border-t-2 border-gray-300">
            <td className="px-4 pt-3 pb-3 font-semibold text-gray-900">Total</td>
            <td className="px-4 pt-3 pb-3" />
            <td className="px-4 pt-3 pb-3 text-right tabular-nums text-gray-400 font-semibold">
              {data.totalEstimateHours > 0 ? `${data.totalEstimateHours}h` : "—"}
            </td>
            <td className={`px-4 pt-3 pb-3 text-right tabular-nums font-semibold ${
              data.totalEstimateHours > 0 && data.totalHours > data.totalEstimateHours
                ? "text-red-600"
                : "text-gray-900"
            }`}>{data.totalHours}h</td>
            <td className="px-4 pt-3 pb-3 text-right tabular-nums text-gray-400 font-semibold">
              {data.totalEstimatedCostEur > 0 ? formatEur(data.totalEstimatedCostEur) : "—"}
            </td>
            <td className={`px-4 pt-3 pb-3 text-right tabular-nums font-semibold ${
              data.totalEstimatedCostEur > 0 && data.totalActualCostEur > data.totalEstimatedCostEur
                ? "text-red-600"
                : "text-gray-900"
            }`}>
              {data.totalActualCostEur > 0 ? formatEur(data.totalActualCostEur) : "—"}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ─── Main section ─────────────────────────────────────────────────────────────

interface Props {
  projectId: string;
  hasTempoToken: boolean;
  workspaceDomain: string;
}

export function ProjectTimesheetSection({ projectId, hasTempoToken, workspaceDomain }: Props): React.JSX.Element {
  const [periodType, setPeriodType] = useState<PeriodType>("month");
  const [periodOffset, setPeriodOffset] = useState(0);

  const { from, to } = getPeriodRange(periodType, periodOffset);

  return (
    <div className="space-y-3">
      <PeriodSelector
        periodType={periodType}
        periodOffset={periodOffset}
        onTypeChange={setPeriodType}
        onOffsetChange={setPeriodOffset}
      />
      <HierarchicalTable
        projectId={projectId}
        hasTempoToken={hasTempoToken}
        from={from}
        to={to}
        workspaceDomain={workspaceDomain}
      />
    </div>
  );
}
