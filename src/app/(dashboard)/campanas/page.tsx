import Link from "next/link";
import { AlertTriangle, Megaphone } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getDateRange } from "@/lib/date-range";
import { getCampaignKPIs } from "@/lib/kpis";
import { semaforoLevel, type SemaforoDirection } from "@/lib/kpis/semaforo";
import { MARCA_OPTIONS } from "@/lib/org";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { LocalDateTime } from "@/components/local-datetime";
import { CampanasFilters } from "./campanas-filters";
import { CAMPANAS_DEFAULT_PERIOD, CAMPANAS_PERIODS } from "./campanas-periods";
import { CampanasChart } from "./campanas-chart";
import { CampanasTable } from "./campanas-table";
import { KpiCard, type KpiCardProps } from "./kpi-card";

type CampanasParams = {
  period?: string;
  dateFrom?: string;
  dateTo?: string;
  marca?: string;
  lineOfBusiness?: string;
  campaignId?: string;
};

/** Horas sin volcado a partir de las cuales se avisa (el script corre a diario a las 04:00). */
const STALE_AFTER_HOURS = 36;

const money = (v: number | null): string => (v === null ? "—" : formatCurrency(v));
const pct = (v: number | null): string => (v === null ? "—" : formatPercent(v));

function shiftMonthKey(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Growth > Campañas (2026-10-16). Los KPIs que planteó Holdmin en la reunión de hoy —
 * CTR, CPC, tasa de conversión y CPL — por campaña y con histórico, sin tener que entrar
 * en Google Ads ni Analytics. Los datos entran por el Google Ads Script
 * (scripts/google-ads/README.md); los leads, del CRM, atribuidos a cada campaña.
 */
export default async function CampanasPage({ searchParams }: { searchParams: Promise<CampanasParams> }): Promise<React.JSX.Element> {
  const params = await searchParams;

  const period = CAMPANAS_PERIODS.some((p) => p.value === params.period) ? (params.period as string) : CAMPANAS_DEFAULT_PERIOD;
  let range = getDateRange(period, params.dateFrom, params.dateTo);
  if (!range.gte || !range.lte) range = getDateRange(CAMPANAS_DEFAULT_PERIOD);

  const marca = params.marca && MARCA_OPTIONS.some((m) => m.value === params.marca) ? params.marca : undefined;

  const allCampaigns = await prisma.adCampaign.findMany({
    select: { id: true, name: true, marca: true, lineOfBusiness: true },
    orderBy: { name: "asc" },
  });
  const lines = [...new Set(allCampaigns.filter((c) => !marca || c.marca === marca).map((c) => c.lineOfBusiness).filter((l): l is string => l !== null))].sort();
  const lineOfBusiness = params.lineOfBusiness && lines.includes(params.lineOfBusiness) ? params.lineOfBusiness : undefined;
  const campaignId = params.campaignId && allCampaigns.some((c) => c.id === params.campaignId) ? params.campaignId : undefined;

  const kpis = await getCampaignKPIs({ dateFrom: range.gte, dateTo: range.lte, marca, lineOfBusiness, campaignId });

  // Las metas son mensuales (KpiTarget MONTH): solo se juzga cuando el rango es un mes.
  const targetPeriodKey =
    period === "this_month" ? kpis.budget.monthKey : period === "last_month" ? shiftMonthKey(kpis.budget.monthKey, -1) : null;
  const targets = targetPeriodKey
    ? await prisma.kpiTarget.findMany({
        where: {
          periodType: "MONTH",
          periodKey: targetPeriodKey,
          metric: { startsWith: "ads_" },
          OR: [{ marca: marca ?? null }, { marca: null }],
        },
      })
    : [];
  const targetByMetric = new Map<string, number>();
  for (const t of targets) {
    if (t.lineOfBusiness && t.lineOfBusiness !== lineOfBusiness) continue;
    const specific = (t.marca ? 2 : 0) + (t.lineOfBusiness ? 1 : 0);
    const current = targetByMetric.get(t.metric);
    if (current === undefined || specific >= 1) targetByMetric.set(t.metric, Number(t.value));
  }
  const badge = (metric: string, value: number | null, direction: SemaforoDirection, fmt: (v: number) => string): KpiCardProps["badge"] => {
    const target = targetByMetric.get(metric);
    if (target === undefined) return targetPeriodKey ? { text: "sin meta", level: null } : undefined;
    return { text: `meta ${fmt(target)}`, level: value === null ? null : semaforoLevel(value, target, direction) };
  };

  const t = kpis.totals;
  const b = kpis.budget;
  const showBudget = period === "this_month";
  const cards: KpiCardProps[] = [
    {
      label: "Gasto",
      value: formatCurrency(t.costEur),
      hint: showBudget && b.monthlyBudgetEur !== null ? `Presupuesto del mes: ${formatCurrency(b.monthlyBudgetEur)} (${formatCurrency(b.dailyBudgetEur ?? 0)}/día)` : undefined,
      tooltip: "Coste en Google Ads en el periodo. El presupuesto del mes es la suma de los presupuestos diarios de las campañas activas por los días del mes.",
      progress:
        showBudget && b.pacePct !== null && b.expectedToDateEur !== null
          ? { pct: b.pacePct, label: `Ritmo ${formatPercent(b.pacePct, { decimals: 0 })} de lo esperado a día de hoy (${formatCurrency(b.expectedToDateEur)})` }
          : undefined,
    },
    {
      label: "Impresiones",
      value: formatNumber(t.impressions),
      hint: t.lostIsBudgetPct !== null ? `Impresiones perdidas por presupuesto: ${pct(t.lostIsBudgetPct)}${t.lostIsRankPct !== null ? ` · por ranking: ${pct(t.lostIsRankPct)}` : ""}` : undefined,
      tooltip: "Veces que se mostró el anuncio. La cuota perdida por presupuesto dice si el freno es el dinero (hay más demanda de la que pagamos) o el ranking.",
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
        "Leads del CRM atribuidos a estas campañas (CrmLead.adCampaignId), contados en su fecha de entrada. Google Ads solo cuenta las conversiones de quien acepta cookies, por eso su cifra es un mínimo. Hasta que la web envíe la atribución al webhook de leads, el enlace lead ↔ campaña se hace a mano desde la ficha del lead.",
      badge: badge("ads_leads_mes", t.leadsCrm, "higher", (v) => formatNumber(v)),
    },
    {
      label: "Tasa de conversión",
      value: pct(t.convRateCrmPct),
      hint: `Google Ads: ${pct(t.convRateAdsPct)}`,
      tooltip: "Leads CRM / clics. Objetivo de la agencia: arrancar entre el 6 y el 8 % y llegar al 10 % (una conversión de cada diez clics).",
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
      tooltip: "Coste por lead que llegó a convertirse en oportunidad (coste / leads cualificados). El CPA es coste / oportunidades ganadas. Menos es mejor.",
      badge: badge("ads_cpl_cualificado_eur", t.cplQualifiedEur, "lower", (v) => formatCurrency(v)),
    },
  ];

  const unmapped = kpis.campaigns.filter((c) => !c.isMapped);
  const isStale = kpis.staleHours !== null && kpis.staleHours > STALE_AFTER_HOURS;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Campañas</h1>
          <p className="text-sm text-gray-500">
            KPIs de Google Ads por campaña: CTR, CPC, tasa de conversión y CPL, cruzados con los leads del CRM.
          </p>
        </div>
        <div className="text-right text-xs">
          {kpis.lastImport ? (
            <>
              <p className={isStale ? "font-medium text-amber-700" : "text-gray-500"}>
                {isStale ? "El script de Google Ads no envía datos desde el " : "Actualizado el "}
                <LocalDateTime date={kpis.lastImport.receivedAt} />
              </p>
              <p className="text-gray-400">
                Lotes: {kpis.lastImport.kinds.map((k) => k.toLowerCase()).join(", ")} · hace {Math.round(kpis.staleHours ?? 0)} h
              </p>
            </>
          ) : (
            <p className="text-gray-400">Sin datos todavía: falta el primer volcado del Google Ads Script</p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-400">Filtros</p>
        <CampanasFilters
          marcas={MARCA_OPTIONS}
          lines={lines}
          campaigns={allCampaigns.filter((c) => !marca || c.marca === marca).map((c) => ({ value: c.id, label: c.name }))}
        />
      </div>

      {unmapped.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">
              {unmapped.length === 1 ? "Hay una campaña sin marca o línea de negocio" : `Hay ${unmapped.length} campañas sin marca o línea de negocio`}
            </p>
            <p className="text-amber-700">
              Sin ese mapeo no se cruza con los leads del CRM ni entra en los filtros por marca.{" "}
              {unmapped.map((c, i) => (
                <span key={c.campaignId}>
                  {i > 0 && " · "}
                  <Link href={`/campanas/${c.campaignId}`} className="underline hover:text-amber-900">
                    {c.name}
                  </Link>
                </span>
              ))}
            </p>
          </div>
        </div>
      )}

      {kpis.campaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 py-16 text-center">
          <Megaphone className="h-10 w-10 text-gray-300" />
          <p className="mt-4 text-sm font-medium text-gray-600">Todavía no hay campañas</p>
          <p className="mt-1 max-w-md text-sm text-gray-400">
            Aparecerán con el primer volcado del Google Ads Script. Instalación en{" "}
            <code className="rounded bg-white px-1">scripts/google-ads/README.md</code>.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((c) => (
              <KpiCard key={c.label} {...c} />
            ))}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Evolución</h2>
              <p className="text-xs text-gray-400">
                {kpis.granularity === "day" ? "Por día" : "Por semana (ISO)"} · {kpis.dateFrom} → {kpis.dateTo}
              </p>
            </div>
            <CampanasChart data={kpis.series} />
          </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold text-gray-900">Campañas</h2>
            <CampanasTable rows={kpis.campaigns} />
          </div>
        </>
      )}
    </div>
  );
}
