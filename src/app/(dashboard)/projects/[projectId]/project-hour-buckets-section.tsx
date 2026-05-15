"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { HourBucketEntry, HourBucketsResponse, UnassignedUser } from "@/app/api/projects/[projectId]/hour-buckets/route";

interface Props {
  projectId: string;
  from: string;
  to: string;
  hasTempoToken: boolean;
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function BucketCard({ bucket, projectId }: { bucket: HourBucketEntry; projectId: string }): React.JSX.Element {
  const router = useRouter();
  const pct = bucket.totalHours > 0 ? (bucket.consumedHours / bucket.totalHours) * 100 : 0;
  const threshold = bucket.alertThreshold * 100;
  const isOver = pct >= 100;
  const isNear = pct >= threshold && !isOver;

  const barColor = isOver ? "bg-red-500" : isNear ? "bg-amber-500" : "bg-green-500";
  const thresholdColor = isOver ? "text-red-600" : isNear ? "text-amber-600" : "text-gray-400";

  const statusLabel = isOver ? "⚠ Agotada" : isNear ? "⚠ Casi agotada" : "Activa";
  const statusClass = isOver
    ? "bg-red-100 text-red-700"
    : isNear
    ? "bg-amber-100 text-amber-700"
    : "bg-green-100 text-green-700";

  function handleClick(): void {
    router.push(`/projects/${projectId}/timesheet?bucketId=${bucket.id}`);
  }

  return (
    <div
      onClick={handleClick}
      className={`bg-white rounded-xl border p-4 space-y-3 cursor-pointer hover:shadow-md transition-shadow ${isOver ? "border-red-200" : isNear ? "border-amber-200" : "border-gray-200"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">{bucket.roleName}</p>
          <p className="text-xs text-gray-400">{bucket.supplierName} · {bucket.ratePerHour}€/h</p>
          {(bucket.startDate ?? bucket.endDate) && (
            <p className="text-xs text-gray-400 mt-0.5">
              {bucket.startDate ? fmtDate(bucket.startDate) : "—"} → {bucket.endDate ? fmtDate(bucket.endDate) : "—"}
            </p>
          )}
        </div>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${statusClass}`}>
          {statusLabel}
        </span>
      </div>

      <div className="space-y-1.5">
        <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
          <div
            className={`h-2.5 rounded-full transition-all ${barColor}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">
            {bucket.consumedHours.toFixed(1)} h / {bucket.totalHours} h
          </span>
          <span className={`font-medium ${thresholdColor}`}>{pct.toFixed(1)}%</span>
        </div>
        <p className="text-xs text-gray-400">Alerta al {Math.round(threshold)}%</p>
      </div>

      <div className="flex justify-between text-xs text-gray-500 pt-1 border-t border-gray-100">
        <span>Restantes: <span className="font-medium text-gray-800">{Math.max(bucket.totalHours - bucket.consumedHours, 0).toFixed(1)} h</span></span>
        <span>Valor: <span className="font-medium text-gray-800">{(bucket.totalHours * bucket.ratePerHour).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}</span></span>
      </div>
    </div>
  );
}

function UnassignedAlert({ users, projectId }: { users: UnassignedUser[]; projectId: string }): React.JSX.Element {
  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-4 h-4 text-orange-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <p className="text-sm font-semibold text-orange-800">Usuarios con horas sin bolsa asignada</p>
      </div>
      <div className="space-y-2">
        {users.map((u) => (
          <div key={u.accountId} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-orange-300 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                {u.displayName[0]?.toUpperCase() ?? "?"}
              </div>
              <span className="text-sm text-gray-800">{u.displayName}</span>
              <span className="text-xs text-gray-500 tabular-nums">{u.hours.toFixed(1)} h</span>
            </div>
            <a
              href={`/projects/${projectId}/timesheet`}
              className="text-xs font-medium text-orange-700 hover:text-orange-900 underline"
              onClick={(e) => e.stopPropagation()}
            >
              Asignar bolsa →
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProjectHourBucketsSection({ projectId, from, to, hasTempoToken }: Props): React.JSX.Element {
  const [response, setResponse] = useState<HourBucketsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setResponse(null);
    setError(null);
    fetch(`/api/projects/${projectId}/hour-buckets?from=${from}&to=${to}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Error cargando bolsas");
        return res.json() as Promise<HourBucketsResponse>;
      })
      .then(setResponse)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Error desconocido"));
  }, [projectId, from, to]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Bolsas de horas
        </span>
        {!hasTempoToken && (
          <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Sin Tempo configurado — consumo no disponible</span>
        )}
      </div>

      {response === null && !error && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      {response !== null && response.buckets.length === 0 && (
        <p className="text-sm text-gray-400">No hay bolsas configuradas. Usa "Configurar" para añadirlas.</p>
      )}

      {response !== null && response.buckets.length > 0 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {response.buckets.map((b) => (
              <BucketCard key={b.id} bucket={b} projectId={projectId} />
            ))}
          </div>

          {response.unassignedUsers.length > 0 && (
            <UnassignedAlert users={response.unassignedUsers} projectId={projectId} />
          )}
        </div>
      )}
    </div>
  );
}
