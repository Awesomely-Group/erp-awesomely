/**
 * Rangos de fechas compartidos por todos los filtros de periodo del ERP.
 *
 * La URL guarda el periodo como `period=<preset>` (p. ej. `this_month`) o, para
 * rangos a medida, como `period=custom&dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD`.
 * Este módulo es la única fuente de verdad de qué significa cada preset, tanto
 * en el servidor (`getDateRange`, Prisma) como en el cliente (DateRangePicker).
 */

export interface DateRange {
  from: Date;
  to: Date;
}

export type DatePresetKey =
  | "today"
  | "yesterday"
  | "last_7_days"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "last_quarter"
  | "this_year"
  | "last_year"
  | "last_3_months"
  | "last_6_months"
  | "last_12_months";

export interface DatePreset {
  key: DatePresetKey;
  label: string;
  getRange: (now?: Date) => DateRange;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function monthRange(year: number, month: number, months = 1): DateRange {
  return {
    from: new Date(year, month, 1),
    to: endOfDay(new Date(year, month + months, 0)),
  };
}

/**
 * "Últimos N meses" es, por decisión de la revisión E8 (2026-09-03),
 * [día 1 del mes (actual − N), fin del mes en curso]: así las previsiones con
 * fecha futura no se cuelan sin límite y el mes en curso siempre se ve entero.
 */
function lastMonths(now: Date, n: number): DateRange {
  const y = now.getFullYear();
  const m = now.getMonth();
  return { from: new Date(y, m - n, 1), to: endOfDay(new Date(y, m + 1, 0)) };
}

export const DATE_PRESETS: readonly DatePreset[] = [
  {
    key: "today",
    label: "Hoy",
    getRange: (now = new Date()) => ({ from: startOfDay(now), to: endOfDay(now) }),
  },
  {
    key: "yesterday",
    label: "Ayer",
    getRange: (now = new Date()) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      return { from: startOfDay(d), to: endOfDay(d) };
    },
  },
  {
    key: "last_7_days",
    label: "Últimos 7 días",
    getRange: (now = new Date()) => ({
      from: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6),
      to: endOfDay(now),
    }),
  },
  {
    key: "this_month",
    label: "Mes actual",
    getRange: (now = new Date()) => monthRange(now.getFullYear(), now.getMonth()),
  },
  {
    key: "last_month",
    label: "Mes anterior",
    getRange: (now = new Date()) => monthRange(now.getFullYear(), now.getMonth() - 1),
  },
  {
    key: "this_quarter",
    label: "Trimestre actual",
    getRange: (now = new Date()) => {
      const q = Math.floor(now.getMonth() / 3);
      return monthRange(now.getFullYear(), q * 3, 3);
    },
  },
  {
    key: "last_quarter",
    label: "Trimestre anterior",
    getRange: (now = new Date()) => {
      const q = Math.floor(now.getMonth() / 3);
      return monthRange(now.getFullYear(), q * 3 - 3, 3);
    },
  },
  {
    key: "this_year",
    label: "Año actual",
    getRange: (now = new Date()) => monthRange(now.getFullYear(), 0, 12),
  },
  {
    key: "last_year",
    label: "Año anterior",
    getRange: (now = new Date()) => monthRange(now.getFullYear() - 1, 0, 12),
  },
  {
    key: "last_3_months",
    label: "Últimos 3 meses",
    getRange: (now = new Date()) => lastMonths(now, 3),
  },
  {
    key: "last_6_months",
    label: "Últimos 6 meses",
    getRange: (now = new Date()) => lastMonths(now, 6),
  },
  {
    key: "last_12_months",
    label: "Últimos 12 meses",
    getRange: (now = new Date()) => lastMonths(now, 12),
  },
];

/** Orden de los atajos en el selector por defecto (facturas, dashboard, proformas…). */
export const DEFAULT_PRESET_KEYS: readonly DatePresetKey[] = [
  "last_12_months",
  "today",
  "yesterday",
  "last_7_days",
  "this_month",
  "last_month",
  "this_quarter",
  "last_quarter",
  "this_year",
  "last_year",
];

/** Atajos para las vistas mensuales (flujo de caja, previsiones): mes entero siempre. */
export const MONTHLY_PRESET_KEYS: readonly DatePresetKey[] = [
  "last_3_months",
  "last_6_months",
  "last_12_months",
  "this_month",
  "last_month",
  "this_quarter",
  "last_quarter",
  "this_year",
  "last_year",
];

const PRESET_BY_KEY = new Map<string, DatePreset>(DATE_PRESETS.map((p) => [p.key, p]));

export function isDatePresetKey(value: string | null | undefined): value is DatePresetKey {
  return value != null && PRESET_BY_KEY.has(value);
}

export function getPreset(key: string | null | undefined): DatePreset | undefined {
  return key ? PRESET_BY_KEY.get(key) : undefined;
}

/** Rango de un preset conocido (tipado sin null, para valores por defecto). */
export function presetRange(key: DatePresetKey, now: Date = new Date()): DateRange {
  return (PRESET_BY_KEY.get(key) as DatePreset).getRange(now);
}

/** Fecha → `YYYY-MM-DD` en hora local (lo que viaja en la URL). */
export function toDateParam(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** `YYYY-MM-DD` → medianoche local. Devuelve null si el formato no es válido. */
export function parseDateParam(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]) - 1;
  const d = Number(match[3]);
  const date = new Date(y, m, d);
  if (date.getFullYear() !== y || date.getMonth() !== m || date.getDate() !== d) return null;
  return date;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Devuelve el preset cuyo rango coincide (a nivel de día) con el dado, o null. */
export function matchPreset(from: Date, to: Date, now: Date = new Date()): DatePresetKey | null {
  for (const preset of DATE_PRESETS) {
    const r = preset.getRange(now);
    if (sameDay(r.from, from) && sameDay(r.to, to)) return preset.key;
  }
  return null;
}

/**
 * Traduce los parámetros de la URL al rango que muestra el selector.
 * Sin periodo ni fechas → null ("todas las fechas").
 */
export function resolvePeriodRange(
  period: string | null | undefined,
  dateFrom?: string | null,
  dateTo?: string | null,
  now: Date = new Date()
): DateRange | null {
  const preset = getPreset(period);
  if (preset) return preset.getRange(now);

  const from = parseDateParam(dateFrom);
  const to = parseDateParam(dateTo);
  if (!from && !to) return null;
  const f = from ?? (to as Date);
  const t = to ?? (from as Date);
  return f <= t ? { from: startOfDay(f), to: endOfDay(t) } : { from: startOfDay(t), to: endOfDay(f) };
}

/**
 * Inversa de `resolvePeriodRange`: el rango elegido → parámetros de URL.
 * Si coincide con un preset se guarda la clave (así "mes actual" sigue siendo
 * el mes actual mañana); si no, `custom` con las fechas.
 */
export function serializePeriodRange(
  range: DateRange | null,
  now: Date = new Date()
): { period: string; dateFrom: string; dateTo: string } {
  if (!range) return { period: "", dateFrom: "", dateTo: "" };
  const key = matchPreset(range.from, range.to, now);
  if (key) return { period: key, dateFrom: "", dateTo: "" };
  return { period: "custom", dateFrom: toDateParam(range.from), dateTo: toDateParam(range.to) };
}

function isLastDayOfMonth(d: Date): boolean {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() === d.getDate();
}

/**
 * Desplaza el rango un "paso" hacia atrás o adelante (botones Anterior/Siguiente).
 * Si el rango son meses enteros se mueve por meses; si no, por su número de días.
 */
export function shiftRange(range: DateRange, direction: -1 | 1): DateRange {
  const { from, to } = range;
  if (from.getDate() === 1 && isLastDayOfMonth(to)) {
    const months =
      (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) + 1;
    return monthRange(from.getFullYear(), from.getMonth() + months * direction, months);
  }
  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / dayMs) + 1;
  const newFrom = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days * direction);
  const newTo = new Date(to.getFullYear(), to.getMonth(), to.getDate() + days * direction);
  return { from: startOfDay(newFrom), to: endOfDay(newTo) };
}

/**
 * Rango para consultas (Prisma `gte`/`lte`) a partir de los parámetros de URL.
 * Acepta cualquier preset de `DATE_PRESETS`, `custom` con fechas, o fechas
 * sueltas sin `period`. Sin nada → `{}` (sin filtro).
 */
export function getDateRange(
  period: string,
  dateFrom?: string,
  dateTo?: string,
  now: Date = new Date()
): { gte?: Date; lte?: Date } {
  const preset = getPreset(period);
  if (preset) {
    const r = preset.getRange(now);
    return { gte: r.from, lte: r.to };
  }
  if (period === "custom" || (!period && (dateFrom || dateTo))) {
    const from = parseDateParam(dateFrom);
    const to = parseDateParam(dateTo);
    return {
      gte: from ?? undefined,
      lte: to ? endOfDay(to) : undefined,
    };
  }
  return {};
}
