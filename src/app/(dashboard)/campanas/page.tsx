import Link from "next/link";
import { AlertTriangle, Megaphone } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCampaignKPIs } from "@/lib/kpis";
import { MARCA_OPTIONS } from "@/lib/org";
import { LocalDateTime } from "@/components/local-datetime";
import { CampanasFilters } from "./campanas-filters";
import { resolveCampanasRange } from "./campanas-periods";
import { CampanasChart } from "./campanas-chart";
import { CampanasTable } from "./campanas-table";
import { KpiCard } from "./kpi-card";
import { buildCampaignCards } from "./kpi-cards";
import { getAdsTargetBadgeBuilder, shiftMonthKey } from "./targets";

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

/**
 * Growth > Campañas (2026-10-16). Los KPIs que planteó Holdmin en la reunión de hoy —
 * CTR, CPC, tasa de conversión y CPL — por campaña y con histórico, sin tener que entrar
 * en Google Ads ni Analytics. Los datos entran por el Google Ads Script
 * (scripts/google-ads/README.md); los leads, del CRM, atribuidos a cada campaña.
 */
export default async function CampanasPage({ searchParams }: { searchParams: Promise<CampanasParams> }): Promise<React.JSX.Element> {
  const params = await searchParams;

  const { period, from, to } = resolveCampanasRange(params.period, params.dateFrom, params.dateTo);

  const marca = params.marca && MARCA_OPTIONS.some((m) => m.value === params.marca) ? params.marca : undefined;

  const allCampaigns = await prisma.adCampaign.findMany({
    select: { id: true, name: true, marca: true, lineOfBusiness: true },
    orderBy: { name: "asc" },
  });
  const lines = [...new Set(allCampaigns.filter((c) => !marca || c.marca === marca).map((c) => c.lineOfBusiness).filter((l): l is string => l !== null))].sort();
  const lineOfBusiness = params.lineOfBusiness && lines.includes(params.lineOfBusiness) ? params.lineOfBusiness : undefined;
  const campaignId = params.campaignId && allCampaigns.some((c) => c.id === params.campaignId) ? params.campaignId : undefined;

  const kpis = await getCampaignKPIs({ dateFrom: from, dateTo: to, marca, lineOfBusiness, campaignId });

  // Las metas son mensuales (KpiTarget MONTH): solo se juzga cuando el rango es un mes.
  const targetPeriodKey =
    period === "this_month" ? kpis.budget.monthKey : period === "last_month" ? shiftMonthKey(kpis.budget.monthKey, -1) : null;
  const badge = await getAdsTargetBadgeBuilder({ marca, lineOfBusiness, periodKey: targetPeriodKey });

  const cards = buildCampaignCards({ totals: kpis.totals, budget: kpis.budget, showBudget: period === "this_month", badge });

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
