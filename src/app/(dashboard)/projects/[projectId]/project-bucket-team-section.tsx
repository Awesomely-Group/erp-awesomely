"use client";

import React, { useEffect, useState } from "react";
import type { ProjectUserRoleEntry } from "@/app/api/projects/[projectId]/user-roles/route";
import { setProjectUserRole } from "../actions";

interface Props {
  projectId: string;
  from: string;
  to: string;
  bucketRoleIds: string[];
}

export function ProjectBucketTeamSection({ projectId, from, to, bucketRoleIds }: Props): React.JSX.Element {
  const [entries, setEntries] = useState<ProjectUserRoleEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [rates, setRates] = useState<Record<string, string>>({});

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEntries(null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);
    fetch(`/api/projects/${projectId}/user-roles?from=${from}&to=${to}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Error cargando equipo");
        return r.json() as Promise<ProjectUserRoleEntry[]>;
      })
      .then((data) => {
        setEntries(data);
        const initial: Record<string, string> = {};
        for (const e of data) {
          initial[e.accountId] = (e.projectRate ?? e.supplierRate ?? "").toString();
        }
        setRates(initial);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Error desconocido"));
  }, [projectId, from, to]);

  async function handleRoleChange(accountId: string, roleId: string): Promise<void> {
    if (roleId === "") {
      setPending(accountId);
      await setProjectUserRole(projectId, accountId, null);
      setEntries((prev) =>
        prev?.map((e) => e.accountId === accountId ? { ...e, effectiveRoleId: null, projectRate: null } : e) ?? null
      );
      setPending(null);
      return;
    }
    const entry = entries?.find((e) => e.accountId === accountId);
    const currentRate = rates[accountId];
    const effectiveRate = currentRate !== "" && currentRate !== undefined ? parseFloat(currentRate) : (entry?.supplierRate ?? null);
    setPending(accountId);
    await setProjectUserRole(projectId, accountId, roleId, effectiveRate);
    setEntries((prev) =>
      prev?.map((e) => e.accountId === accountId ? { ...e, effectiveRoleId: roleId, projectRate: effectiveRate } : e) ?? null
    );
    setPending(null);
  }

  async function handleRateBlur(accountId: string, roleId: string | null, rate: string): Promise<void> {
    if (!roleId) return;
    const parsed = rate !== "" ? parseFloat(rate) : null;
    setPending(accountId);
    await setProjectUserRole(projectId, accountId, roleId, parsed);
    setEntries((prev) =>
      prev?.map((e) => e.accountId === accountId ? { ...e, projectRate: parsed } : e) ?? null
    );
    setPending(null);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
          </svg>
          Asignación de roles del equipo
        </span>
      </div>

      {entries === null && !error && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      {entries !== null && entries.length === 0 && (
        <p className="text-sm text-gray-400">Sin horas registradas en este período.</p>
      )}

      {entries !== null && entries.length > 0 && (
        <ul className="divide-y divide-gray-100">
          {entries.map((e) => {
            const hasNoRole = e.effectiveRoleId === null;
            return (
              <li key={e.accountId} className="py-2.5">
                <div className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${hasNoRole ? "bg-orange-200 text-orange-700" : "bg-indigo-500 text-white"}`}>
                    {e.displayName[0]?.toUpperCase() ?? "?"}
                  </div>
                  <span className="text-sm text-gray-900 flex-1 truncate">{e.displayName}</span>
                  {e.roles.length === 0 ? (
                    <span className="text-xs text-gray-400 italic">Sin roles (configura en Proveedores)</span>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <select
                        value={e.effectiveRoleId ?? ""}
                        disabled={pending === e.accountId}
                        onChange={(ev) => void handleRoleChange(e.accountId, ev.target.value)}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
                      >
                        <option value="">— Sin bolsa —</option>
                        {e.roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}{bucketRoleIds.includes(r.id) ? " ●" : ""}
                          </option>
                        ))}
                      </select>
                      {e.effectiveRoleId && (
                        <>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={rates[e.accountId] ?? ""}
                            disabled={pending === e.accountId}
                            onChange={(ev) => setRates((prev) => ({ ...prev, [e.accountId]: ev.target.value }))}
                            onBlur={(ev) => void handleRateBlur(e.accountId, e.effectiveRoleId, ev.target.value)}
                            className="w-20 text-xs border border-gray-200 rounded-lg px-2 py-1.5 disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-indigo-400 text-right"
                            placeholder={e.supplierRate?.toString() ?? "0"}
                          />
                          <span className="text-xs text-gray-400 flex-shrink-0">€/h</span>
                        </>
                      )}
                    </div>
                  )}
                  {hasNoRole && e.roles.length > 0 && (
                    <svg className="w-4 h-4 text-orange-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                  )}
                </div>
                {e.effectiveRoleId && e.supplierRate != null && (e.projectRate == null || e.projectRate !== e.supplierRate) && (
                  <p className="text-[10px] text-gray-400 mt-0.5 ml-10">
                    Coste proveedor: {e.supplierRate.toLocaleString("es-ES", { minimumFractionDigits: 2 })} €/h
  				      </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
