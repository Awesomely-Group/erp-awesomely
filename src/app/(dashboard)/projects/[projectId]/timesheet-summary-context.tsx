"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

export interface SummaryUser {
  accountId: string;
  displayName: string;
  totalHours: number;
  estimateHours: number;
  actualCostEur: number;
  estimatedCostEur: number | null;
  ratePerHour: number;
}

interface TimesheetSummaryState {
  users: SummaryUser[];
  loading: boolean;
  setData: (users: SummaryUser[], loading: boolean) => void;
}

const TimesheetSummaryContext = createContext<TimesheetSummaryState>({
  users: [],
  loading: false,
  setData: () => undefined,
});

export function TimesheetSummaryProvider({
  children,
  initialLoading = false,
}: {
  children: React.ReactNode;
  initialLoading?: boolean;
}): React.JSX.Element {
  const [users, setUsers] = useState<SummaryUser[]>([]);
  const [loading, setLoading] = useState(initialLoading);

  const setData = useCallback((newUsers: SummaryUser[], newLoading: boolean) => {
    setUsers(newUsers);
    setLoading(newLoading);
  }, []);

  return (
    <TimesheetSummaryContext.Provider value={{ users, loading, setData }}>
      {children}
    </TimesheetSummaryContext.Provider>
  );
}

export function useTimesheetSummary(): TimesheetSummaryState {
  return useContext(TimesheetSummaryContext);
}

function formatEur(amount: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function TimesheetSummarySlot(): React.JSX.Element | null {
  const { users, loading } = useTimesheetSummary();

  if (!loading && users.length === 0) return null;

  if (loading) {
    return (
      <div className="flex flex-col gap-2 animate-pulse">
        <div className="h-4 bg-gray-100 rounded w-60" />
        <div className="h-4 bg-gray-100 rounded w-52" />
      </div>
    );
  }

  const totalH = Math.round(users.reduce((s, u) => s + u.totalHours, 0) * 100) / 100;
  const totalEstH = Math.round(users.reduce((s, u) => s + u.estimateHours, 0) * 100) / 100;
  const totalActCost = Math.round(users.reduce((s, u) => s + u.actualCostEur, 0) * 100) / 100;
  const totalEstCost = Math.round(users.reduce((s, u) => s + (u.estimatedCostEur ?? 0), 0) * 100) / 100;
  const hasAnyCost = users.some((u) => u.ratePerHour > 0);

  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-xs">
      <div className="space-y-1.5">
        <div className="flex items-center gap-3 pb-1.5 border-b border-gray-100">
          <div className="w-5 h-5 flex-shrink-0" />
          <span className="w-28" />
          <span className="text-gray-400 min-w-[64px]">Horas real / est.</span>
          {hasAnyCost && <span className="text-gray-400 min-w-[80px]">Coste real / est.</span>}
        </div>
        {users.map((user) => {
          const overH = user.estimateHours > 0 && user.totalHours > user.estimateHours;
          const overCost = user.estimatedCostEur != null && user.actualCostEur > user.estimatedCostEur;
          return (
            <div key={user.accountId} className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full bg-indigo-500 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                {user.displayName[0]?.toUpperCase() ?? "?"}
              </div>
              <span className="font-medium text-gray-700 w-28 truncate">{user.displayName}</span>
              <div className="flex items-baseline gap-1 min-w-[64px]">
                <span className={`tabular-nums font-semibold ${overH ? "text-red-600" : "text-gray-900"}`}>
                  {user.totalHours}h
                </span>
                {user.estimateHours > 0 && <span className="text-gray-400">/ {user.estimateHours}h</span>}
              </div>
              {hasAnyCost && (
                <div className="flex items-baseline gap-1 min-w-[80px]">
                  <span className={`tabular-nums font-semibold ${overCost ? "text-red-600" : "text-gray-700"}`}>
                    {user.ratePerHour > 0 ? formatEur(user.actualCostEur) : "—"}
                  </span>
                  {user.estimatedCostEur != null && user.ratePerHour > 0 && (
                    <span className="text-gray-400">/ {formatEur(user.estimatedCostEur)}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {users.length > 1 && (
          <div className="flex items-center gap-3 pt-1.5 border-t border-gray-100">
            <div className="w-5 h-5 flex-shrink-0" />
            <span className="font-semibold text-gray-800 w-28">Total</span>
            <div className="flex items-baseline gap-1 min-w-[64px]">
              <span
                className={`tabular-nums font-semibold ${totalEstH > 0 && totalH > totalEstH ? "text-red-600" : "text-gray-900"}`}
              >
                {totalH}h
              </span>
              {totalEstH > 0 && <span className="text-gray-400">/ {totalEstH}h</span>}
            </div>
            {hasAnyCost && totalActCost > 0 && (
              <div className="flex items-baseline gap-1 min-w-[80px]">
                <span
                  className={`tabular-nums font-semibold ${totalEstCost > 0 && totalActCost > totalEstCost ? "text-red-600" : "text-gray-700"}`}
                >
                  {formatEur(totalActCost)}
                </span>
                {totalEstCost > 0 && <span className="text-gray-400">/ {formatEur(totalEstCost)}</span>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
