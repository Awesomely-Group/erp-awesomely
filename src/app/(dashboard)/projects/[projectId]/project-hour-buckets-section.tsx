"use client";

import React, { useEffect, useState } from "react";
import type { HourBucketEntry } from "@/app/api/projects/[projectId]/hour-buckets/route";

interface Props {
  projectId: string;
  from: string;
  to: string;
  hasTempoToken: boolean;
}

function BucketCard({ bucket }: { bucket: HourBucketEntry }): React.JSX.Element {
  const pct = bucket.totalHours > 0 ? (bucket.consumedHours / bucket.totalHours) * 100 : 0;
  const threshold = bucket.alertThreshold * 100;
  const isOver = pct >= 100;
  const isNear = pct >= threshold && !isOver;

  const barColor = isOver ? "bg-red-500" : isNear ? "bg-amber-500" : "bg-green-500";
  const thresholdColor = isOver ? "text-red-600" : isNear ? "text-amber-600" : "text-gray-400";

  return (
    <div className={`bg-white rounded-xl border p-4 space-y-3 ${isOver ? "border-red-200" : isNear ? "border-amber-200" : "border-gray-200"}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-900">{bucket.roleName}</p>
          <p className="text-xs text-gray-400">{bucket.supplierName} · {bucket.ratePerHour}€/h</p>
        </div>
        {(isOver || isNear) && (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${isOver ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
            {isOver ? "⚠ Agotada" : "⚠ Casi agotada"}
          </span>
        )}
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

export function ProjectHourBucketsSection({ projectId, from, to, hasTempoToken }: Props): React.JSX.Element {
  const [buckets, setBuckets] = useState<HourBucketEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBuckets(null);
    setError(null);
    fetch(`/api/projects/${projectId}/hour-buckets?from=${from}&to=${to}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Error cargando bolsas");
        return res.json() as Promise<HourBucketEntry[]>;
      })
      .then(setBuckets)
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

      {buckets === null && !error && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      {buckets !== null && buckets.length === 0 && (
        <p className="text-sm text-gray-400">No hay bolsas configuradas. Usa "Configurar" para añadirlas.</p>
      )}

      {buckets !== null && buckets.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {buckets.map((b) => (
            <BucketCard key={b.id} bucket={b} />
          ))}
        </div>
      )}
    </div>
  );
}
