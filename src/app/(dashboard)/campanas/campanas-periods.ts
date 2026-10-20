// Sin "use client": lo importan tanto la página (servidor) como los filtros (cliente).
// Un módulo cliente no puede exportar constantes para el servidor.
export const CAMPANAS_PERIODS = [
  { value: "this_month", label: "Este mes" },
  { value: "last_month", label: "Mes pasado" },
  { value: "this_quarter", label: "Este trimestre" },
  { value: "last_quarter", label: "Trimestre pasado" },
  { value: "this_year", label: "Este año" },
  { value: "last_year", label: "Año pasado" },
  { value: "custom", label: "Personalizado…" },
] as const;

export const CAMPANAS_DEFAULT_PERIOD = "this_month";

import { getDateRange } from "@/lib/date-range";

/**
 * Rango de fechas de /campanas a partir de los query params: periodo válido o el mes en
 * curso. Siempre devuelve las dos fechas (las métricas de Ads se leen sobre un rango).
 */
export function resolveCampanasRange(period: string | undefined, dateFrom?: string, dateTo?: string): { period: string; from: Date; to: Date } {
  const valid = CAMPANAS_PERIODS.some((p) => p.value === period) ? (period as string) : CAMPANAS_DEFAULT_PERIOD;
  const range = getDateRange(valid, dateFrom, dateTo);
  if (range.gte && range.lte) return { period: valid, from: range.gte, to: range.lte };
  const fallback = getDateRange(CAMPANAS_DEFAULT_PERIOD);
  return { period: CAMPANAS_DEFAULT_PERIOD, from: fallback.gte ?? new Date(), to: fallback.lte ?? new Date() };
}
