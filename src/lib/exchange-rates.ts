// Frankfurter API — free ECB exchange rates
// Docs: https://www.frankfurter.app/docs

import { prisma } from "./prisma";

const FRANKFURTER_BASE = "https://api.frankfurter.app";

interface FrankfurterResponse {
  date: string;
  base: string;
  rates: Record<string, number>;
}

/**
 * Banda de paridad: divisas cuyo tipo frente al euro cae dentro de [MIN, MAX] se
 * contabilizan 1:1, sin convertir. Ver `resolveFxRateToEur` para el porqué.
 */
export const PARITY_BAND_MIN = 0.5;
export const PARITY_BAND_MAX = 2;

export function isWithinParityBand(rateToEur: number): boolean {
  return rateToEur >= PARITY_BAND_MIN && rateToEur <= PARITY_BAND_MAX;
}

/**
 * `exchange_rates.date` es `@db.Date` (sin hora). Las fechas de factura llegan de un
 * timestamp de Holded y pueden traer hora, lo que hacía que la caché nunca acertara:
 * se escribía truncada a día y se buscaba con hora. Normalizar aquí a medianoche UTC
 * deja la clave de lectura y la de escritura iguales.
 */
function utcMidnight(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

export async function getEurRateForDate(currency: string, date: Date): Promise<number> {
  if (currency === "EUR") return 1;

  const day = utcMidnight(date);
  const dateStr = day.toISOString().split("T")[0];

  // Check cache
  const cached = await prisma.exchangeRate.findUnique({
    where: { date_currency: { date: day, currency } },
  });
  if (cached) return Number(cached.rateToEur);

  const rate = await fetchEurRate(currency, dateStr);

  await prisma.exchangeRate.upsert({
    where: { date_currency: { date: day, currency } },
    update: { rateToEur: rate },
    create: { date: day, currency, rateToEur: rate },
  });

  return rate;
}

async function fetchEurRate(currency: string, dateStr: string): Promise<number> {
  const res = await fetch(`${FRANKFURTER_BASE}/${dateStr}?from=${currency}&to=EUR`, {
    next: { revalidate: 86400 },
  });

  if (res.ok) return readEurRate(await res.json(), currency, dateStr);

  // Fallback: try the latest rate
  const fallback = await fetch(`${FRANKFURTER_BASE}/latest?from=${currency}&to=EUR`);
  if (!fallback.ok) {
    throw new Error(`Cannot get exchange rate for ${currency} on ${dateStr}`);
  }
  return readEurRate(await fallback.json(), currency, dateStr);
}

/**
 * Frankfurter responde 200 con `rates` vacío para una divisa que no cubre, así que un
 * `res.ok` no basta: sin este guardia se cachearía `undefined` como tipo de cambio.
 */
function readEurRate(payload: unknown, currency: string, dateStr: string): number {
  const rate = (payload as FrankfurterResponse)?.rates?.EUR;
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
    throw new Error(`Frankfurter did not return a usable EUR rate for ${currency} on ${dateStr}`);
  }
  return rate;
}

export type FxRateSource = "eur" | "parity-band" | "ecb" | "unavailable";

export type ResolvedFxRate = {
  /** Multiplicador DIVISA→EUR que se guarda en `fxRateToEur`. */
  fxRateToEur: number;
  source: FxRateSource;
};

/**
 * Decide el `fxRateToEur` de un documento en divisa cuando Holded NO nos da su propio
 * tipo (`currencyChange`), que es siempre en los endpoints de listado que usa el sync
 * en bloque — solo lo devuelve el detalle de un documento individual.
 *
 * Historia, porque el criterio ha cambiado dos veces (ver docs/PLAN-fix-pl-reconciliation.md):
 *
 * 1. Originalmente se convertía con el tipo del BCE. No cuadraba con el PyG real de
 *    Holded: ~7.000 € de más en ventas para una empresa que factura todo en GBP/USD.
 * 2. Se cambió a 1:1 (tratar el importe extranjero como si ya fuera EUR) porque se
 *    verificó que el propio asiento contable de Holded guarda el importe sin convertir.
 *    Con eso el PyG 2026 de SL y OU cuadró al 0,05%.
 * 3. Ese 1:1 se validó **solo contra GBP y USD**, que están cerca de la paridad, así que
 *    el error absoluto era pequeño. Con el peso filipino (~64 PHP/EUR) el mismo criterio
 *    multiplica el gasto por 64: tres facturas de un colaborador de LaTroupe entraron
 *    como 514.407,61 € cuando su valor real son ~7.980 € — el 64% de todas las compras
 *    de 2025 y suficiente para dar la vuelta al margen bruto del grupo.
 *
 * El criterio actual conserva lo verificado y corta el caso absurdo: si el tipo real está
 * dentro de la banda de paridad se mantiene el 1:1 (GBP ≈ 1,17 y USD ≈ 0,92 caen dentro,
 * así que la conciliación del PyG 2026 no se mueve ni un céntimo); si está fuera, se
 * convierte de verdad con el tipo del BCE del día de la factura.
 *
 * Contrapartida asumida a propósito: para esas divisas lejanas el PyG del ERP ya no
 * reproduce el de Holded, porque Holded sigue contabilizando el importe sin convertir.
 * Se prefiere un dashboard económicamente cierto a cuadrar con un dato que es erróneo
 * en origen.
 *
 * Nunca lanza: si no se puede obtener el tipo (API caída, divisa no cubierta) se vuelve
 * al 1:1 de antes y se deja constancia en el log. Degradar al comportamiento anterior es
 * peor que convertir, pero mejor que romper un sync entero por una petición HTTP.
 */
export async function resolveFxRateToEur(
  currency: string,
  date: Date
): Promise<ResolvedFxRate> {
  if (currency === "EUR") return { fxRateToEur: 1, source: "eur" };

  let rate: number;
  try {
    rate = await getEurRateForDate(currency, date);
  } catch (err) {
    console.error(
      `[fx] no se pudo obtener el tipo ${currency}→EUR para ${date.toISOString().slice(0, 10)}; ` +
        `se contabiliza 1:1 (importe sin convertir). Causa:`,
      err
    );
    return { fxRateToEur: 1, source: "unavailable" };
  }

  if (isWithinParityBand(rate)) return { fxRateToEur: 1, source: "parity-band" };

  return { fxRateToEur: rate, source: "ecb" };
}

export async function convertToEur(
  amount: number,
  currency: string,
  date: Date
): Promise<{ amountEur: number; rate: number }> {
  const rate = await getEurRateForDate(currency, date);
  return { amountEur: amount * rate, rate };
}
