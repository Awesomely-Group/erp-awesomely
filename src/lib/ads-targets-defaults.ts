/**
 * Metas por defecto de las campañas de pago (Growth > Campañas). Son los números que dio
 * la agencia (Holdmin / Toni Masero) para la fase de arranque de las campañas de Odoo:
 * reunión del 2026-10-16 (CTR 6-8 % → 10-11 %, conversión 6-8 % → 10 %) y kickoff del
 * 2026-10-08 (CPL ≈ 40-50 €, 6-10 leads/mes). El CPC no lo cuantificó; sale de
 * CPL × conversión (40 € × 8 % ≈ 3,2 €).
 *
 * Son VALORES POR DEFECTO, no verdad revelada: se cargan como filas normales de
 * `KpiTarget` (solo si no existe ya una para esa métrica/periodo) y se editan en
 * /settings como cualquier otra meta. Aquí viven las dos fases para que, cuando Toni dé
 * el veredicto tras la optimización, baste con cargar la fase "objetivo".
 */
export type AdsTargetPhase = "arranque" | "objetivo";

export interface AdsTargetDefault {
  metric: string;
  label: string;
  value: number;
}

export const ADS_TARGET_SCOPE = { marca: "Gigson Solutions", lineOfBusiness: "ODOO" } as const;

export const ADS_TARGET_DEFAULTS: Record<AdsTargetPhase, AdsTargetDefault[]> = {
  arranque: [
    { metric: "ads_ctr_pct", label: "CTR (%)", value: 7 },
    { metric: "ads_conv_rate_pct", label: "Tasa de conversión (%)", value: 7 },
    { metric: "ads_cpl_eur", label: "CPL (€)", value: 50 },
    { metric: "ads_leads_mes", label: "Leads al mes", value: 6 },
    { metric: "ads_cpc_eur", label: "CPC (€)", value: 3.5 },
  ],
  objetivo: [
    { metric: "ads_ctr_pct", label: "CTR (%)", value: 10 },
    { metric: "ads_conv_rate_pct", label: "Tasa de conversión (%)", value: 10 },
    { metric: "ads_cpl_eur", label: "CPL (€)", value: 40 },
    { metric: "ads_leads_mes", label: "Leads al mes", value: 10 },
    { metric: "ads_cpc_eur", label: "CPC (€)", value: 4 },
  ],
};

export const ADS_TARGET_PHASE_LABEL: Record<AdsTargetPhase, string> = {
  arranque: "Arranque (oct-nov 2026)",
  objetivo: "Objetivo tras optimizar",
};

const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isMonthKey(value: string): boolean {
  return MONTH_KEY_RE.test(value);
}
