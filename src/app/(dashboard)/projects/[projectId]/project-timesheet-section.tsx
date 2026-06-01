"use client";

import React, { useState, useEffect, useMemo } from "react";

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
interface IssueWithWorklogs { issueKey: string; jiraIssueId: number; summary: string; totalHours: number; originalEstimateHours: number | null; worklogs: WorklogDetail[]; actualCostEur: number; estimatedCostEur: number | null; hourBucketId?: string; }
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

interface BucketInfo {
  roleName: string;
  totalHours: number;
}

interface BucketOption {
  id: string;
  roleId: string;
  roleName: string;
  code: string | null;
  totalHours: number;
}

interface HierarchicalTableProps {
  projectId: string;
  hasTempoToken: boolean;
  from: string;
  to: string;
  workspaceDomain: string;
  isBolsasHoras?: boolean;
  bucketByRole?: Record<string, BucketInfo>;
  accountToRole?: Record<string, string>;
  filterBucketId?: string;
  filterBucketRoleId?: string;
  buckets?: BucketOption[];
  onAssignIssueToBucket?: (issueKey: string, jiraIssueId: number, hourBucketId: string | null) => Promise<void>;
}

function HierarchicalTable({ projectId, hasTempoToken, from, to, workspaceDomain, isBolsasHoras, bucketByRole, accountToRole, filterBucketId, filterBucketRoleId, buckets, onAssignIssueToBucket }: HierarchicalTableProps): React.JSX.Element {
  const [data, setData] = useState<HierarchicalHoursResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsedUsers, setCollapsedUsers] = useState<Set<string>>(new Set());
  const [bucketOverrides, setBucketOverrides] = useState<Record<string, string | null>>({});
  const [allTimeBucketConsumed, setAllTimeBucketConsumed] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!hasTempoToken) return;
    const today = new Date().toISOString().slice(0, 10);
    fetch(`/api/projects/${projectId}/hour-buckets?from=2020-01-01&to=${today}`)
      .then(async (r) => {
        if (!r.ok) return;
        const body = await r.json() as { buckets: Array<{ id: string; consumedHours: number }> };
        const map: Record<string, number> = {};
        for (const b of body.buckets) map[b.id] = b.consumedHours;
        setAllTimeBucketConsumed(map);
      })
      .catch(() => { /* ignore */ });
  }, [projectId, hasTempoToken]);

  const roleIdToBucketId = useMemo(() => {
    const map: Record<string, string> = {};
    for (const b of buckets ?? []) map[b.roleId] = b.id;
    return map;
  }, [buckets]);

  const bucketConsumedDisplay = useMemo(() => {
    const acc: Record<string, number> = { ...allTimeBucketConsumed };
    if (!data) return acc;
    for (const user of data.users) {
      const userRoleId = accountToRole?.[user.accountId];
      const roleBucketId = userRoleId ? (roleIdToBucketId[userRoleId] ?? null) : null;
      for (const issue of user.issues) {
        const newBucketId = bucketOverrides[issue.issueKey];
        if (newBucketId === undefined) continue;
        const originalBucketId = issue.hourBucketId ?? roleBucketId ?? null;
        if (originalBucketId === newBucketId) continue;
        if (originalBucketId !== null) {
          acc[originalBucketId] = Math.round(Math.max(0, (acc[originalBucketId] ?? 0) - issue.totalHours) * 100) / 100;
        }
        if (newBucketId !== null) {
          acc[newBucketId] = Math.round(((acc[newBucketId] ?? 0) + issue.totalHours) * 100) / 100;
        }
      }
    }
    return acc;
  }, [allTimeBucketConsumed, data, bucketOverrides, accountToRole, roleIdToBucketId]);

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

  const visibleUsers: UserWithIssues[] = data
    ? filterBucketId
      ? data.users
          .map((user) => {
            const effectiveRoleId = accountToRole?.[user.accountId];
            const filteredIssues = user.issues.filter((issue) => {
              const currentBucketId =
                bucketOverrides[issue.issueKey] !== undefined
                  ? bucketOverrides[issue.issueKey]
                  : (issue.hourBucketId ?? null);
              if (currentBucketId === filterBucketId) return true;
              if (!currentBucketId && effectiveRoleId === filterBucketRoleId) return true;
              return false;
            });
            return {
              ...user,
              issues: filteredIssues,
              totalHours: Math.round(filteredIssues.reduce((s, i) => s + i.totalHours, 0) * 100) / 100,
              actualCostEur: Math.round(filteredIssues.reduce((s, i) => s + i.actualCostEur, 0) * 100) / 100,
              estimatedCostEur: filteredIssues.some((i) => i.estimatedCostEur != null)
                ? Math.round(filteredIssues.reduce((s, i) => s + (i.estimatedCostEur ?? 0), 0) * 100) / 100
                : null,
            };
          })
          .filter((u) => u.issues.length > 0)
      : data.users
    : [];

  if (!data || visibleUsers.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 px-4 py-10 text-center text-sm text-gray-400">
        {filterBucketId && data && data.users.length > 0
          ? "No hay horas registradas en esta bolsa en este período"
          : "Sin horas registradas en este período"}
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
          {visibleUsers.map((user) => {
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
                      {isBolsasHoras && accountToRole?.[user.accountId] && bucketByRole?.[accountToRole[user.accountId]] && (
                        <span className="ml-1 inline-flex items-center rounded-full border border-amber-200 bg-amber-50 text-amber-700 text-[11px] font-medium px-2 py-0.5">
                          {bucketByRole[accountToRole[user.accountId]].roleName}
                        </span>
                      )}
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

                {!collapsed && user.issues.map((issue) => {
                  const currentBucketId = bucketOverrides[issue.issueKey] !== undefined
                    ? bucketOverrides[issue.issueKey]
                    : (issue.hourBucketId ?? null);
                  return (
                  <React.Fragment key={`${user.accountId}-${issue.issueKey}`}>
                    <tr className="border-t border-gray-100">
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2 pl-8">
                          <IssueIcon />
                          <span className="text-gray-700 truncate max-w-[280px]">{issue.summary}</span>
                          {isBolsasHoras && buckets && onAssignIssueToBucket && (
                            <select
                              value={currentBucketId ?? ""}
                              onChange={(e) => {
                                const val = e.target.value || null;
                                setBucketOverrides((prev) => ({ ...prev, [issue.issueKey]: val }));
                                void onAssignIssueToBucket(issue.issueKey, issue.jiraIssueId, val).catch(() => {
                                  setBucketOverrides((prev) => {
                                    const next = { ...prev };
                                    delete next[issue.issueKey];
                                    return next;
                                  });
                                });
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="ml-1 text-xs border border-gray-200 rounded px-1.5 py-0.5 bg-white text-gray-500 cursor-pointer hover:border-indigo-300 focus:outline-none focus:border-indigo-400"
                            >
                              <option value="">— Sin bolsa —</option>
                              {buckets.map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.code ? `[${b.code}] ` : ""}{b.roleName}{" · "}{hasTempoToken ? `${bucketConsumedDisplay[b.id] ?? 0}/${b.totalHours}h` : `${b.totalHours}h`}
                                </option>
                              ))}
                            </select>
                          )}
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
                  );
                })}
              </React.Fragment>
            );
          })}

          <tr className="border-t-2 border-gray-300">
            <td className="px-4 pt-3 pb-3 font-semibold text-gray-900">Total</td>
            <td className="px-4 pt-3 pb-3" />
            {(() => {
              const filteredEstH = Math.round(visibleUsers.flatMap((u) => u.issues).reduce((s, i) => s + (i.originalEstimateHours ?? 0), 0) * 100) / 100;
              const filteredH = Math.round(visibleUsers.reduce((s, u) => s + u.totalHours, 0) * 100) / 100;
              const filteredEstCost = Math.round(visibleUsers.reduce((s, u) => s + (u.estimatedCostEur ?? 0), 0) * 100) / 100;
              const filteredActCost = Math.round(visibleUsers.reduce((s, u) => s + u.actualCostEur, 0) * 100) / 100;
              return (<>
                <td className="px-4 pt-3 pb-3 text-right tabular-nums text-gray-400 font-semibold">
                  {filteredEstH > 0 ? `${filteredEstH}h` : "—"}
                </td>
                <td className={`px-4 pt-3 pb-3 text-right tabular-nums font-semibold ${filteredEstH > 0 && filteredH > filteredEstH ? "text-red-600" : "text-gray-900"}`}>{filteredH}h</td>
                <td className="px-4 pt-3 pb-3 text-right tabular-nums text-gray-400 font-semibold">
                  {filteredEstCost > 0 ? formatEur(filteredEstCost) : "—"}
                </td>
                <td className={`px-4 pt-3 pb-3 text-right tabular-nums font-semibold ${filteredEstCost > 0 && filteredActCost > filteredEstCost ? "text-red-600"
                  : "text-gray-900"}`}>
                  {filteredActCost > 0 ? formatEur(filteredActCost) : "—"}
                </td>
              </>);
            })()}
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
  isBolsasHoras?: boolean;
  bucketByRole?: Record<string, BucketInfo>;
  accountToRole?: Record<string, string>;
  filterBucketId?: string;
  filterBucketRoleId?: string;
  filterBucketName?: string;
  buckets?: BucketOption[];
  onAssignIssueToBucket?: (issueKey: string, jiraIssueId: number, hourBucketId: string | null) => Promise<void>;
}

export function ProjectTimesheetSection({ projectId, hasTempoToken, workspaceDomain, isBolsasHoras, bucketByRole, accountToRole, filterBucketId, filterBucketRoleId, filterBucketName, buckets, onAssignIssueToBucket }: Props): React.JSX.Element {
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
      {filterBucketId && filterBucketName && (
        <div className="flex items-center justify-between rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 text-sm">
          <div className="flex items-center gap-2 text-amber-800">
            <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
            </svg>
            <span>Bolsa: <strong>{filterBucketName}</strong></span>
          </div>
          <a
            href={`/projects/${projectId}/timesheet`}
            className="text-xs font-medium text-amber-700 hover:text-amber-900 transition-colors"
          >
            Quitar filtro ×
          </a>
        </div>
      )}
      <HierarchicalTable
        projectId={projectId}
        hasTempoToken={hasTempoToken}
        from={from}
        to={to}
        workspaceDomain={workspaceDomain}
        isBolsasHoras={isBolsasHoras}
        bucketByRole={bucketByRole}
        accountToRole={accountToRole}
        filterBucketId={filterBucketId}
        filterBucketRoleId={filterBucketRoleId}
        buckets={buckets}
        onAssignIssueToBucket={onAssignIssueToBucket}
      />
    </div>
  );
}
