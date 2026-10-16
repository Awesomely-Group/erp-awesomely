import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import type { SemaforoDirection } from "@/lib/kpis/semaforo";
import type { CampaignBudgetStatus, CampaignMetricSet } from "@/lib/kpis/types";
import type { KpiCardProps } from "./kpi-card";

const money = (v: number | null): string => (v === null ? "—" : formatCurrency(v));
const pct = (v: number | null): string => (v === null ? "—" : formatPercent(v));

export type BadgeBuilder = (
  metric: string,
  value: number | null,
  direction: SemaforoDirection,
  fmt: (v: number) => string,
) => KpiCardProps["badge"];

/**
 * Las ocho tarjetas de KPIs de campañas, compartidas por /campanas y por el detalle de
 * cada campaña. Los textos de ayuda recogen los objetivos que dio la agencia (Holdmin,
 * 2026-10-16): CTR 6-8 % → 10-11 %, conversión 6-8 % → 10 %, CPL ≈ 40 €, 6-10 leads/mes.
 */
export function buildCampaignCards({
  totals: t,
  budget: b,
  showBudget,
  badge,
}: {
  totals: CampaignMetricSet;
  budget: CampaignBudgetStatus;
  showBudget: boolean;
  badge: BadgeBuilder;
}): KpiCardProps[] {
  return [
    {
      label: "Gasto",
      value: formatCurrency(t.costEur),
      hint:
        showBudget && b.monthlyBudgetEur !== null
          ? `Presupuesto del mes: ${formatCurrency(b.monthlyBudgetEur)} (${formatCurrency(b.dailyBudgetEur ?? 0)}/día)`
          : undefined,
      tooltip:
        "Coste en Google Ads en el periodo. El presupuesto del mes es la suma de los presupuestos diarios de las campañas activas por los días del mes.",
      progress:
        showBudget && b.pacePct !== null && b.expectedToDateEur !== null
          ? {
              pct: b.pacePct,
              label: `Ritmo ${formatPercent(b.pacePct, { decimals: 0 })} de lo esperado a día de hoy (${formatCurrency(b.expectedToDateEur)})`,
            }
          : undefined,
    },
    {
      label: "Impresiones",
      value: formatNumber(t.impressions),
      hint:
        t.lostIsBudgetPct !== null
          ? `Impresiones perdidas por presupuesto: ${pct(t.lostIsBudgetPct)}${t.lostIsRankPct !== null ? ` · por ranking: ${pct(t.lostIsRankPct)}` : ""}`
          : undefined,
      tooltip:
        "Veces que se mostró el anuncio. La cuota perdida por presupuesto dice si el freno es el dinero (hay más demanda de la que pagamos) o el ranking.",
    },
    {
      label: "CTR",
      value: pct(t.ctrPct),
      hint: `${formatNumber(t.clicks)} clics`,
      tooltip: "Clics / impresiones. Objetivo de la agencia: arrancar entre el 6 y el 8 % y optimizar hacia el 10-11 %.",
      badge: badge("ads_ctr_pct", t.ctrPct, "higher", (v) => formatPercent(v)),
    },
    {
      label: "CPC",
      value: money(t.cpcEur),
      tooltip: "Coste por clic (coste / clics). Debería bajar al salir de la fase de aprendizaje. Menos es mejor.",
      badge: badge("ads_cpc_eur", t.cpcEur, "lower", (v) => formatCurrency(v)),
    },
    {
      label: "Leads CRM",
      value: formatNumber(t.leadsCrm),
      hint: `Google Ads cuenta ${formatNumber(t.conversionsAds, { decimals: 1 })} conv.`,
      tooltip:
        "Leads del CRM atribuidos a estas campañas (CrmLead.adCampaignId), contados en su fecha de entrada. Google Ads solo cuenta las conversiones de quien acepta cookies, por eso su cifra es un mínimo. Hasta que la web envíe la atribución al webhook de leads, el enlace lead ↔ campaña se hace a mano desde la ficha del lead o de la campaña.",
      badge: badge("ads_leads_mes", t.leadsCrm, "higher", (v) => formatNumber(v)),
    },
    {
      label: "Tasa de conversión",
      value: pct(t.convRateCrmPct),
      hint: `Google Ads: ${pct(t.convRateAdsPct)}`,
      tooltip:
        "Leads CRM / clics. Objetivo de la agencia: arrancar entre el 6 y el 8 % y llegar al 10 % (una conversión de cada diez clics).",
      badge: badge("ads_conv_rate_pct", t.convRateCrmPct, "higher", (v) => formatPercent(v)),
    },
    {
      label: "CPL",
      value: money(t.cplCrmEur),
      hint: `Google Ads: ${money(t.cplAdsEur)}`,
      tooltip: "Coste por lead (coste / leads CRM). La agencia espera unos 40 € y 6-10 leads al mes por campaña. Menos es mejor.",
      badge: badge("ads_cpl_eur", t.cplCrmEur, "lower", (v) => formatCurrency(v)),
    },
    {
      label: "CPL cualificado",
      value: money(t.cplQualifiedEur),
      hint: `${t.leadsQualified} cualificados · CPA ${money(t.cpaEur)} (${t.dealsWon} ganadas)`,
      tooltip:
        "Coste por lead que llegó a convertirse en oportunidad (coste / leads cualificados). El CPA es coste / oportunidades ganadas. Menos es mejor.",
      badge: badge("ads_cpl_cualificado_eur", t.cplQualifiedEur, "lower", (v) => formatCurrency(v)),
    },
  ];
}
