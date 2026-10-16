import { InfoTooltip } from "@/components/info-tooltip";
import { SEMAFORO_CLASSES, type SemaforoLevel } from "@/lib/kpis/semaforo";
import { cn } from "@/lib/utils";

export interface KpiCardProps {
  label: string;
  value: string;
  /** Línea secundaria: la versión "Google Ads" del mismo dato, el nº de clics, etc. */
  hint?: string;
  tooltip?: string;
  /** Meta del mes (KpiTarget) ya formateada, con el color del semáforo. */
  badge?: { text: string; level: SemaforoLevel | null };
  /** Barra de progreso (gasto del mes vs presupuesto). */
  progress?: { pct: number; label: string };
}

/**
 * Tarjeta de KPI de /campanas. Sin hooks: se renderiza en servidor con los valores ya
 * formateados. El semáforo lleva dirección (ver src/lib/kpis/semaforo.ts) porque aquí
 * conviven métricas "más es mejor" (CTR, leads) y "menos es mejor" (CPC, CPL).
 */
export function KpiCard({ label, value, hint, tooltip, badge, progress }: KpiCardProps): React.JSX.Element {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="flex items-center text-xs font-medium text-gray-500">
        {label}
        {tooltip && <InfoTooltip text={tooltip} />}
      </p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-gray-900">{value}</span>
        {badge && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-medium",
              badge.level ? SEMAFORO_CLASSES[badge.level] : "bg-gray-100 text-gray-500",
            )}
          >
            {badge.text}
          </span>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
      {progress && (
        <div className="mt-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className={cn("h-full rounded-full", progress.pct > 110 ? "bg-amber-500" : "bg-indigo-500")}
              style={{ width: `${Math.min(100, Math.max(0, progress.pct))}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-gray-400">{progress.label}</p>
        </div>
      )}
    </div>
  );
}
