"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { HourBucketEntry, HourBucketsResponse, UnassignedUser } from "@/app/api/projects/[projectId]/hour-buckets/route";
import { ProjectBucketTeamSection } from "./project-bucket-team-section";
import { bucketStatus, type BucketStatus } from "@/lib/hour-bucket-consumption";
import { formatCurrency, formatHourlyRate, formatHours, formatPercent } from "@/lib/utils";

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

const STATUS_LABEL: Record<BucketStatus, string> = {
  ACTIVE: "Activa",
  NEAR_EXHAUSTION: "⚠ Casi agotada",
  EXHAUSTED: "⚠ Agotada",
  EXPIRED: "Caducada",
};

const STATUS_CLASS: Record<BucketStatus, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  NEAR_EXHAUSTION: "bg-amber-100 text-amber-700",
  EXHAUSTED: "bg-red-100 text-red-700",
  EXPIRED: "bg-gray-200 text-gray-600",
};

const BAR_CLASS: Record<BucketStatus, string> = {
  ACTIVE: "bg-green-500",
  NEAR_EXHAUSTION: "bg-amber-500",
  EXHAUSTED: "bg-red-500",
  EXPIRED: "bg-gray-400",
};

const BORDER_CLASS: Record<BucketStatus, string> = {
  ACTIVE: "border-gray-200",
  NEAR_EXHAUSTION: "border-amber-200",
  EXHAUSTED: "border-red-200",
  EXPIRED: "border-gray-300",
};

function BucketCard({ bucket, projectId }: { bucket: HourBucketEntry; projectId: string }): React.JSX.Element {
  const router = useRouter();
  const pct = bucket.totalHours > 0 ? (bucket.consumedHours / bucket.totalHours) * 100 : 0;
  // Mismo veredicto que da la API del portal: la función vive en @/lib para que la
  // pantalla interna y lo que ve el cliente no puedan discrepar.
  const status = bucketStatus({
    consumedHours: bucket.consumedHours,
    totalHours: bucket.totalHours,
    alertThreshold: bucket.alertThreshold,
    endDate: bucket.endDate,
    today: new Date().toISOString().slice(0, 10),
  });

  function handleClick(): void {
    router.push(`/projects/${projectId}/timesheet?bucketId=${bucket.id}`);
  }

  return (
    <div
      onClick={handleClick}
      className={`bg-white rounded-xl border p-4 space-y-3 cursor-pointer hover:shadow-md transition-shadow ${BORDER_CLASS[status]}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-gray-900">{bucket.roleName}</p>
            {bucket.code && (
              <span className="font-mono text-[11px] font-medium text-indigo-600 bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5 leading-none">
                {bucket.code}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400">{formatHourlyRate(bucket.ratePerHour)}</p>
          {(bucket.startDate ?? bucket.endDate) && (
            <p className="text-xs text-gray-400 mt-0.5">
              {bucket.startDate ? fmtDate(bucket.startDate) : "—"} → {bucket.endDate ? fmtDate(bucket.endDate) : "—"}
            </p>
          )}
        </div>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${STATUS_CLASS[status]}`}>
          {STATUS_LABEL[status]}
        </span>
      </div>

      <div className="space-y-1.5">
        <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
          <div
            className={`h-2.5 rounded-full transition-all ${BAR_CLASS[status]}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">
            {formatHours(bucket.consumedHours)} / {formatHours(bucket.totalHours)}
          </span>
          <span className="font-medium text-gray-400">{formatPercent(pct)}</span>
        </div>
        {bucket.pendingApprovalHours > 0 && (
          <p className="text-xs text-amber-600">
            + {formatHours(bucket.pendingApprovalHours)} pendientes de aprobar
          </p>
        )}
        <p className="text-xs text-gray-400">Alerta al {Math.round(bucket.alertThreshold * 100)}%</p>
      </div>

      <div className="flex justify-between text-xs text-gray-500 pt-1 border-t border-gray-100">
        <span>Restantes: <span className="font-medium text-gray-800">{formatHours(Math.max(bucket.totalHours - bucket.consumedHours, 0))}</span></span>
        <span>Valor: <span className="font-medium text-gray-800">{formatCurrency(bucket.totalHours * bucket.ratePerHour)}</span></span>
      </div>
    </div>
  );
}

function UnassignedAlert({ users }: { users: UnassignedUser[] }): React.JSX.Element {
  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-4 h-4 text-orange-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <p className="text-sm font-semibold text-orange-800">Usuarios con horas sin rol asignado</p>
      </div>
      <div className="space-y-2">
        {users.map((u) => (
          <div key={u.accountId} className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-orange-300 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">
              {u.displayName[0]?.toUpperCase() ?? "?"}
            </div>
            <span className="text-sm text-gray-800">{u.displayName}</span>
            <span className="text-xs text-gray-500 tabular-nums">{formatHours(u.hours)}</span>
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResponse(null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);
    // Sin `from`/`to`: el consumo de una bolsa es el de toda su ventana, no el del
    // periodo que se esté mirando en pantalla.
    fetch(`/api/projects/${projectId}/hour-buckets`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Error cargando bolsas");
        return res.json() as Promise<HourBucketsResponse>;
      })
      .then(setResponse)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Error desconocido"));
  }, [projectId]);

  // Solo avisa si de verdad no hay de dónde leer: un proyecto ya vinculado a Giro no
  // necesita token de Tempo para nada.
  const sinFuente = response !== null && response.source === "TEMPO" && !hasTempoToken;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Bolsas de horas
        </span>
        {response !== null && response.source === "GIRO" && (
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">Horas de Giro</span>
        )}
        {sinFuente && (
          <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Sin Tempo ni Giro configurado — consumo no disponible</span>
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
        <p className="text-sm text-gray-400">No hay bolsas configuradas. Usa &quot;Configurar&quot; para añadirlas.</p>
      )}

      {response !== null && response.buckets.length > 0 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {response.buckets.map((b) => (
              <BucketCard key={b.id} bucket={b} projectId={projectId} />
            ))}
          </div>

          {response.pendingAttributionHours > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <span className="font-semibold">{formatHours(response.pendingAttributionHours)}</span> facturables
              no han caído en ninguna bolsa. Hasta repartirlas, el saldo de arriba es un techo y no un dato cerrado.
            </div>
          )}

          {response.unassignedUsers.length > 0 && (
            <UnassignedAlert users={response.unassignedUsers} />
          )}
        </div>
      )}

      {response !== null && (
        <ProjectBucketTeamSection
          projectId={projectId}
          from={from}
          to={to}
          bucketRoleIds={response.buckets.map((b) => b.roleId)}
        />
      )}
    </div>
  );
}
