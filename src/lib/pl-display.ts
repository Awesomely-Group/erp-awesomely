/**
 * La parte del P&L que el **navegador** necesita: la estructura de líneas, los tipos
 * públicos y los dos formateadores de celda.
 *
 * Separada de `pl-data.ts` porque aquello importa `prisma` y `pl-client.tsx` es un
 * componente cliente: importar de allí metía el runtime de Prisma en el grafo del bundle
 * del navegador. Mientras el adapter de Neon fue el único eso pasó desapercibido —es
 * JavaScript puro y se empaqueta sin quejarse—, pero bastó con que la base hablara por
 * TCP (`pg`, que hace `require("net")`) para que el build se cayera con "Can't resolve
 * 'dns'", a kilómetros de la causa real.
 *
 * Regla, la misma que Giro documenta para `issue-display.ts`: **un componente cliente no
 * importa de un módulo que toque Prisma.** Lo compartido vive aquí.
 */
import { EMPTY_VALUE, formatNumber, formatPercent } from "@/lib/format";
// ─── Public params ────────────────────────────────────────────────────────────

export interface PlParams {
  /** Parámetro antiguo (selector de año). Se respeta si no hay `period`/fechas. */
  year?: string;
  period?: string;
  dateFrom?: string;
  dateTo?: string;
}

// ─── P&L line structure (PGC) ─────────────────────────────────────────────────

export type PlDataKey =
  | "ventas"
  | "aprovisionamientos"
  | "variacion_existencias"
  | "trabajos_activo"
  | "otros_ingresos_explotacion"
  | "gastos_personal"
  | "otros_gastos_explotacion"
  | "amortizacion"
  | "otros_resultados"
  | "ingresos_financieros"
  | "gastos_financieros"
  | "otros_resultados_financieros"
  | "impuesto_beneficios";

export type PlSubtotalKey =
  | "margen_bruto"
  | "ebitda"
  | "ebit"
  | "resultado_financiero"
  | "resultado_antes_impuestos"
  | "resultado_ejercicio"
  | "cash_flow";

export type PlLineKey = PlDataKey | PlSubtotalKey;

export interface PlLineDef {
  key: PlLineKey;
  label: string;
  type: "data" | "subtotal";
}

export const PL_LINE_DEFS: PlLineDef[] = [
  { key: "ventas",                        label: "Ventas",                                    type: "data" },
  { key: "aprovisionamientos",            label: "Aprovisionamientos",                        type: "data" },
  { key: "margen_bruto",                  label: "Margen Bruto",                              type: "subtotal" },
  { key: "variacion_existencias",         label: "Variación de existencias",                  type: "data" },
  { key: "trabajos_activo",               label: "Trabajos realizados para su activo",         type: "data" },
  { key: "otros_ingresos_explotacion",    label: "Otros ingresos de explotación",             type: "data" },
  { key: "gastos_personal",               label: "Gastos de personal",                        type: "data" },
  { key: "otros_gastos_explotacion",      label: "Otros gastos de explotación",               type: "data" },
  { key: "amortizacion",                  label: "Amortización del inmovilizado",             type: "data" },
  { key: "otros_resultados",              label: "Otros resultados",                          type: "data" },
  { key: "ebitda",                        label: "EBITDA",                                    type: "subtotal" },
  { key: "ebit",                          label: "Resultado de Explotación (EBIT)",           type: "subtotal" },
  { key: "ingresos_financieros",          label: "Ingresos financieros",                      type: "data" },
  { key: "gastos_financieros",            label: "Gastos financieros",                        type: "data" },
  { key: "otros_resultados_financieros",  label: "Otros resultados financieros",              type: "data" },
  { key: "resultado_financiero",          label: "Resultado Financiero",                      type: "subtotal" },
  { key: "resultado_antes_impuestos",     label: "Resultado antes de impuestos",              type: "subtotal" },
  { key: "impuesto_beneficios",           label: "Impuesto sobre beneficios",                 type: "data" },
  { key: "resultado_ejercicio",           label: "Resultado del ejercicio",                   type: "subtotal" },
  { key: "cash_flow",                     label: "Cash Flow",                                 type: "subtotal" },
];

// ─── Public types ─────────────────────────────────────────────────────────────

/** Un valor por línea de datos del P&L. */
export type DataRecord = Record<PlDataKey, number>;
/** Lo mismo, ya con los subtotales calculados. Es lo que viaja a la pantalla. */
export type FullRecord = Record<PlLineKey, number>;

export interface PlMonthPoint {
  monthKey: string;
  monthLabel: string;
  lines: FullRecord;
}

export interface PlEntityData {
  companyId: string;
  companyName: string;
  months: PlMonthPoint[];
  yearly: FullRecord;
}

export interface PlData {
  /** Rango efectivo (meses completos). */
  from: Date;
  to: Date;
  /** Rango en formato YYYY-MM-DD, listo para el selector. */
  fromParam: string;
  toParam: string;
  periodLabel: string;
  entities: PlEntityData[];
  consolidated: PlEntityData;
}


/**
 * Importe de una celda del P&L. Regla propia de esta pantalla: el cero se
 * muestra como vacío y las cifras grandes se abrevian para que la tabla, que
 * es muy ancha, quepa sin scroll horizontal.
 */
export function formatPlAmount(amount: number): string {
  if (amount === 0) return EMPTY_VALUE;
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) {
    return `${formatNumber(amount / 1_000_000, { decimals: 2 })}M`;
  }
  return formatNumber(amount);
}

/** Peso de una línea del P&L sobre ventas. */
export function formatPlRatio(value: number, ventas: number): string {
  if (ventas === 0) return EMPTY_VALUE;
  return formatPercent((value / ventas) * 100);
}

