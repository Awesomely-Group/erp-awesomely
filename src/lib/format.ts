/**
 * Formato numérico y de fechas del ERP.
 *
 * Toda la presentación de números pasa por aquí: antes convivían `toFixed`,
 * `toLocaleString` e `Intl.NumberFormat` sueltos por las pantallas, con hasta
 * cuatro convenciones distintas para la misma unidad (p.ej. €/h).
 *
 * Dos invariantes:
 *  - Locale único `es-ES` y agrupación de miles siempre activa (el default
 *    `"auto"` no agrupa por debajo de 10.000 en español).
 *  - Espacio duro (U+00A0) entre el número y su unidad (`€`, `€/h`, `h`, `%`,
 *    `pp`), que es lo que ya inserta Intl en la moneda.
 *
 * Los helpers NO aceptan `null`: así TypeScript sigue detectando el nulo en el
 * origen. Para el caso "sin dato" existe `formatMaybe`.
 */

const LOCALE = "es-ES";

/** Espacio duro: el separador que Intl usa entre importe y símbolo de moneda. */
const NBSP = "\u00A0";

/** Glifo único para "sin dato". */
export const EMPTY_VALUE = "—";

function format(value: number, options: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(LOCALE, {
    useGrouping: "always",
    ...options,
  }).format(value);
}

/**
 * Evita el "-0" fantasma: un valor negativo que redondea a cero con los
 * decimales pedidos se renderiza como cero positivo.
 */
function withoutNegativeZero(value: number, decimals: number): number {
  return Math.abs(value) < 0.5 / 10 ** decimals ? 0 : value;
}

/** Importe monetario. `1234.5` → `"1.234,50 €"` */
export function formatCurrency(amount: number, currency = "EUR"): string {
  return format(withoutNegativeZero(amount, 2), {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Importe sin céntimos, para tablas densas. `1234.5` → `"1.235 €"` */
export function formatCurrencyRounded(amount: number, currency = "EUR"): string {
  return format(withoutNegativeZero(amount, 0), {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/** Tarifa horaria, siempre con 2 decimales. `45` → `"45,00 €/h"` */
export function formatHourlyRate(rate: number, currency = "EUR"): string {
  return `${formatCurrency(rate, currency)}/h`;
}

/**
 * Horas. Por defecto entre 0 y 1 decimales, para que un `40` de configuración
 * no se renderice como `40,0 h` y un agregado de Tempo conserve su decimal.
 * `12.53` → `"12,5 h"`, `40` → `"40 h"`
 */
export function formatHours(
  hours: number,
  options?: { decimals?: number },
): string {
  const decimals = options?.decimals;
  const value = format(withoutNegativeZero(hours, decimals ?? 1), {
    minimumFractionDigits: decimals ?? 0,
    maximumFractionDigits: decimals ?? 1,
  });
  return `${value}${NBSP}h`;
}

/**
 * Porcentaje. Recibe el valor **ya multiplicado por 100**, no un ratio:
 * `formatPercent(12.3)` → `"12,3 %"`. (Es lo que ya calculaban todos los call
 * sites; usar `style: "percent"` obligaría a dividir en cada uno.)
 *
 * `signed` fuerza el signo en desviaciones y `unit: "pp"` expresa puntos
 * porcentuales.
 */
export function formatPercent(
  percentValue: number,
  options?: { decimals?: number; signed?: boolean; unit?: "%" | "pp" },
): string {
  const decimals = options?.decimals ?? 1;
  const value = format(withoutNegativeZero(percentValue, decimals), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    signDisplay: options?.signed === true ? "exceptZero" : "auto",
  });
  return `${value}${NBSP}${options?.unit ?? "%"}`;
}

/** Número sin unidad: contadores, unidades, tipos de cambio. `1234` → `"1.234"` */
export function formatNumber(
  value: number,
  options?: { decimals?: number },
): string {
  const decimals = options?.decimals ?? 0;
  return format(withoutNegativeZero(value, decimals), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Tick de eje en miles. `120000` → `"120k"`.
 * Conserva la semántica del `${(v / 1000).toFixed(0)}k` que estaba triplicado
 * en los gráficos, salvo el "-0k" que ahora sale como "0k".
 */
export function formatThousandsTick(value: number): string {
  const thousands = withoutNegativeZero(value / 1000, 0);
  return `${thousands.toFixed(0)}k`;
}

/**
 * Aplica un formateador solo si hay valor. `formatMaybe(rate, formatHourlyRate)`
 * → `"45,00 €/h"` o `"—"`.
 */
export function formatMaybe<T>(
  value: T | null | undefined,
  formatter: (value: T) => string,
  fallback: string = EMPTY_VALUE,
): string {
  return value === null || value === undefined ? fallback : formatter(value);
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(date));
}

export function formatDateTime(date: Date | string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}
