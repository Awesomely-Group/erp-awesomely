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

  useEffect(() => {
    setEntries(null);
    setError(null);
    fetch(`/api/projects/${projectId}/user-roles?from=${from}&to=${to}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Error cargando equipo");
        return r.json() as Promise<ProjectUserRoleEntry[]>;
      })
      .then(setEntries)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Error desconocido"));
  }, [projectId, from, to]);

  async function handleChange(accountId: string, roleId: string): Promise<void> {
    setPending(accountId);
    await setProjectUserRole(projectId, accountId, roleId === "" ? null : roleId);
    setEntries((prev) =>
      prev?.map((e) => e.accountId === accountId ? { ...e, effectiveRoleId: roleId || null } : e) ?? null
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
              <li key={e.accountId} className="flex items-center gap-3 py-2.5">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${hasNoRole ? "bg-orange-200 text-orange-700" : "bg-indigo-500 text-white"}`}>
                  {e.displayName[0]?.toUpperCase() ?? "?"}
                </div>
                <span className="text-sm text-gray-900 flex-1 truncate">{e.displayName}</span>
                {e.roles.length === 0 ? (
                  <span className="text-xs text-gray-400 italic">Sin roles (configura en Proveedores)</span>
                ) : (
                  <select
                    value={e.effectiveRoleId ?? ""}
                    disabled={pending === e.accountId}
                    onChange={(ev) => void handleChange(e.accountId, ev.target.value)}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
                  >
                    <option value="">— Sin bolsa —</option>
                    {e.roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}{bucketRoleIds.includes(r.id) ? " ●" : ""}
                      </option>
                    ))}
                  </select>
                )}
                {hasNoRole && e.roles.length > 0 && (
                  <svg className="w-4 h-4 text-orange-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
