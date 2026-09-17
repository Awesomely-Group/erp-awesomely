// Ámbito temporal de una sincronización con Holded.
//
// Hasta ahora todos los syncs releían la historia completa (desde
// HOLDED_SYNC_FROM_YEAR hasta hoy) en cada ejecución. Con el cron diario eso
// significaba ~81 ventanas mensuales de /purchases + 7 años de /ledger-entries
// cada mañana, sin que la mayoría de esos periodos pudiera haber cambiado.
//
// El modo "incremental" acota las ventanas a los últimos
// HOLDED_INCREMENTAL_LOOKBACK_DAYS días; el modo "full" mantiene el
// comportamiento anterior. Los borrados anteriores a la ventana solo los detecta
// el modo full, que es el único que ve la foto completa de compras, proformas y
// mayor; las ventas se piden enteras y se reconcilian en los dos modos (ver
// sync.ts, que además exige que el listado no haya llegado truncado).

export type SyncMode = "full" | "incremental";

export interface SyncScope {
  mode: SyncMode;
  /**
   * Primer día cubierto por la sincronización, alineado a principio de mes para
   * que encaje con las ventanas mensuales de la API.
   */
  fromDate: Date;
}

/** Margen por defecto del modo incremental: cubre facturas introducidas con retraso. */
export const DEFAULT_INCREMENTAL_LOOKBACK_DAYS = 60;

/** Lee el modo de un `?mode=` de query string. Todo lo que no sea "full" es incremental. */
export function parseSyncMode(value: string | null | undefined): SyncMode {
  return value === "full" ? "full" : "incremental";
}

export function incrementalLookbackDays(): number {
  const raw = process.env.HOLDED_INCREMENTAL_LOOKBACK_DAYS;
  if (!raw) return DEFAULT_INCREMENTAL_LOOKBACK_DAYS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_INCREMENTAL_LOOKBACK_DAYS;
}

/**
 * Calcula el ámbito de una sincronización.
 *
 * En incremental se lee, como mínimo, **el ejercicio en curso entero**: una
 * compra de febrero puede corregirse o borrarse en septiembre, y hasta que no se
 * relee no hay forma de enterarse. El lookback manda cuando va más atrás que el
 * 1 de enero, que es lo que pasa en enero y febrero: ahí hay que seguir mirando
 * el cierre del ejercicio anterior.
 *
 * Nunca se retrocede más allá del 1 de enero de `fromYear`: si el lookback se
 * configura muy grande, el resultado converge al modo full.
 */
export function resolveSyncScope(
  mode: SyncMode,
  opts: { fromYear: number; now?: Date; lookbackDays?: number },
): SyncScope {
  const now = opts.now ?? new Date();
  const historyStart = new Date(opts.fromYear, 0, 1);

  if (mode === "full") {
    return { mode, fromDate: historyStart };
  }

  const lookbackDays = opts.lookbackDays ?? incrementalLookbackDays();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - lookbackDays);

  // Alineado a principio de mes: la ventana de /purchases se construye por meses
  // completos, así que empezar a mitad de mes dejaría fuera documentos del propio mes.
  const monthStart = new Date(cutoff.getFullYear(), cutoff.getMonth(), 1);

  // El más antiguo de los dos: el ejercicio en curso siempre entra entero, y el
  // lookback lo amplía hacia atrás cuando toca (enero y febrero).
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const fromDate = monthStart < yearStart ? monthStart : yearStart;

  return {
    mode,
    fromDate: fromDate < historyStart ? historyStart : fromDate,
  };
}

/** Ventanas mensuales `YYYY-MM-DD` (ambos extremos incluidos), de `from` a `to`. */
export function buildMonthlyWindows(
  from: Date,
  to: Date,
): Array<{ start: string; end: string }> {
  const windows: Array<{ start: string; end: string }> = [];
  if (from > to) return windows;

  let year = from.getFullYear();
  let month = from.getMonth() + 1; // 1-12
  const endYear = to.getFullYear();
  const endMonth = to.getMonth() + 1;

  while (year < endYear || (year === endYear && month <= endMonth)) {
    const mm = String(month).padStart(2, "0");
    const lastDay = new Date(year, month, 0).getDate();
    windows.push({
      start: `${year}-${mm}-01`,
      end: `${year}-${mm}-${String(lastDay).padStart(2, "0")}`,
    });

    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }

  return windows;
}

/**
 * Ventana única `YYYY-MM-DD` que cubre exactamente lo mismo que todas las
 * ventanas mensuales juntas: del principio del mes de `from` al final del mes
 * de `to`. `null` si no hay nada que cubrir.
 *
 * Los listados de documentos de la v2 paginan por cursor, así que trocear por
 * meses ya no hace falta para esquivar el tope de 200 por respuesta: una sola
 * ventana paginada cubre lo mismo con muchas menos llamadas. El final de mes se
 * mantiene —en vez de cortar en `to`— porque las ventanas mensuales ya incluían
 * los documentos con fecha futura dentro del mes en curso (facturas recurrentes
 * pre-generadas), y recortarlos ahora los dejaría fuera del listado: el sync los
 * leería como borrados en Holded.
 */
export function buildScopeWindow(
  from: Date,
  to: Date,
): { start: string; end: string } | null {
  const months = buildMonthlyWindows(from, to);
  if (months.length === 0) return null;
  return { start: months[0].start, end: months[months.length - 1].end };
}

/**
 * Ventanas trimestrales en segundos epoch para la API v1, que no pagina de
 * forma fiable y obliga a trocear por fechas.
 */
export function buildQuarterlyWindows(
  from: Date,
  to: Date,
): Array<{ starttmp: number; endtmp: number }> {
  const windows: Array<{ starttmp: number; endtmp: number }> = [];
  if (from > to) return windows;

  let year = from.getFullYear();
  let quarter = Math.floor(from.getMonth() / 3);

  for (;;) {
    const windowStart = new Date(year, quarter * 3, 1);
    if (windowStart > to) break;

    const windowEnd = new Date(year, (quarter + 1) * 3, 1);
    windows.push({
      starttmp: Math.floor(windowStart.getTime() / 1000),
      endtmp: Math.floor(windowEnd.getTime() / 1000),
    });

    quarter++;
    if (quarter > 3) {
      quarter = 0;
      year++;
    }
  }

  return windows;
}

/** Años (inclusive) que toca el ámbito — usado por el libro mayor, que se pide por año. */
export function yearsInScope(scope: SyncScope, now: Date = new Date()): number[] {
  const years: number[] = [];
  for (let y = scope.fromDate.getFullYear(); y <= now.getFullYear(); y++) {
    years.push(y);
  }
  return years;
}
