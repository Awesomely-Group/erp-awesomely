import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getCampaignKPIs } from "@/lib/kpis";
import { aggregateKeywords, aggregateSearchTerms } from "@/lib/ads-matrices";
import { formatCurrency } from "@/lib/format";
import { LocalDateTime } from "@/components/local-datetime";
import { CampanasChart } from "../campanas-chart";
import { CAMPAIGN_STATUS_LABEL } from "../campanas-labels";
import { CAMPANAS_DEFAULT_PERIOD, CAMPANAS_PERIODS, resolveCampanasRange } from "../campanas-periods";
import { KpiCard } from "../kpi-card";
import { buildCampaignCards } from "../kpi-cards";
import { getAdsTargetBadgeBuilder, shiftMonthKey } from "../targets";
import { CampaignMappingForm } from "./campaign-mapping-form";
import { KeywordsTable } from "./keywords-table";
import { SearchTermsTable } from "./search-terms-table";
import { AttributedLeads, type AttributedLead } from "./attributed-leads";

type DetailParams = { period?: string; dateFrom?: string; dateTo?: string };

const PERIOD_LABEL = Object.fromEntries(CAMPANAS_PERIODS.map((p) => [p.value, p.label]));

/**
 * Ficha de una campaña de pago (Growth > Campañas, 2026-10-16): KPIs y evolución de esa
 * campaña, su mapeo con el CRM, las dos matrices de optimización que mira la agencia
 * (keywords y términos de búsqueda) y los leads que se le atribuyen.
 */
export default async function CampaignDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<DetailParams>;
}): Promise<React.JSX.Element> {
  const [{ campaignId }, sp, session] = await Promise.all([params, searchParams, auth()]);

  const campaign = await prisma.adCampaign.findUnique({
    where: { id: campaignId },
    include: { account: { select: { name: true, externalId: true } } },
  });
  if (!campaign) notFound();

  const { period, from, to } = resolveCampanasRange(sp.period, sp.dateFrom, sp.dateTo);
  const dateWhere = { gte: utcDay(from), lte: utcDay(to) };
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const [kpis, keywordRows, termRows, leads, candidates, lines] = await Promise.all([
    getCampaignKPIs({ dateFrom: from, dateTo: to, campaignId }),
    prisma.adKeywordStat.findMany({ where: { campaignId, date: dateWhere } }),
    prisma.adSearchTermStat.findMany({ where: { campaignId, date: dateWhere } }),
    prisma.crmLead.findMany({
      where: { adCampaignId: campaignId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, name: true, status: true, createdAt: true, formId: true, utmCampaign: true, convertedAt: true },
    }),
    // Candidatos a vincular: leads sin campaña, de la misma marca si la campaña la tiene.
    prisma.crmLead.findMany({
      where: { adCampaignId: null, createdAt: { gte: sixMonthsAgo }, ...(campaign.marca ? { marca: campaign.marca } : {}) },
      orderBy: { createdAt: "desc" },
      take: 300,
      select: { id: true, name: true, createdAt: true, formId: true, email: true },
    }),
    prisma.crmStage.findMany({ distinct: ["lineOfBusiness"], select: { lineOfBusiness: true }, orderBy: { lineOfBusiness: "asc" } }),
  ]);

  const targetPeriodKey =
    period === "this_month" ? kpis.budget.monthKey : period === "last_month" ? shiftMonthKey(kpis.budget.monthKey, -1) : null;
  const badge = await getAdsTargetBadgeBuilder({ marca: campaign.marca, lineOfBusiness: campaign.lineOfBusiness, periodKey: targetPeriodKey });
  const cards = buildCampaignCards({ totals: kpis.totals, budget: kpis.budget, showBudget: period === "this_month", badge });

  const keywords = aggregateKeywords(
    keywordRows.map((r) => ({
      adGroupId: r.adGroupId,
      adGroupName: r.adGroupName,
      criterionId: r.criterionId,
      keywordText: r.keywordText,
      matchType: r.matchType,
      date: r.date.toISOString().slice(0, 10),
      impressions: r.impressions,
      clicks: r.clicks,
      costEur: Number(r.costEur),
      conversions: Number(r.conversions),
      qualityScore: r.qualityScore,
    })),
  );
  const searchTerms = aggregateSearchTerms(
    termRows.map((r) => ({
      adGroupId: r.adGroupId,
      adGroupName: r.adGroupName,
      searchTerm: r.searchTerm,
      matchType: r.matchType,
      status: r.status,
      date: r.date.toISOString().slice(0, 10),
      impressions: r.impressions,
      clicks: r.clicks,
      costEur: Number(r.costEur),
      conversions: Number(r.conversions),
    })),
  );

  const attributed: AttributedLead[] = leads.map((l) => ({
    id: l.id,
    name: l.name,
    status: l.status,
    createdAt: l.createdAt.toISOString(),
    formId: l.formId,
    utmCampaign: l.utmCampaign,
    qualified: l.convertedAt !== null,
  }));
  const candidateOptions = candidates.map((c) => ({
    id: c.id,
    label: c.name,
    sublabel: [c.createdAt.toISOString().slice(0, 10), c.formId, c.email].filter(Boolean).join(" · "),
  }));
  const lineSuggestions = [...new Set(lines.map((l) => l.lineOfBusiness))];
  const backQuery = new URLSearchParams();
  if (period !== CAMPANAS_DEFAULT_PERIOD) backQuery.set("period", period);
  if (period === "custom") {
    if (sp.dateFrom) backQuery.set("dateFrom", sp.dateFrom);
    if (sp.dateTo) backQuery.set("dateTo", sp.dateTo);
  }
  const backHref = backQuery.toString() ? `/campanas?${backQuery}` : "/campanas";
  const canEdit = session?.user?.role === "ADMIN";
  const googleAdsUrl = `https://ads.google.com/aw/overview?campaignId=${campaign.externalId}&ocid=&__c=${campaign.account.externalId}`;

  return (
    <div className="space-y-6">
      <div>
        <Link href={backHref} className="text-xs text-gray-400 hover:text-gray-600">
          ← Volver a campañas
        </Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{campaign.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${campaign.status === "ENABLED" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                {CAMPAIGN_STATUS_LABEL[campaign.status] ?? campaign.status}
              </span>
              <span>{campaign.account.name}</span>
              {campaign.dailyBudget !== null && <span>· {formatCurrency(Number(campaign.dailyBudget))}/día</span>}
              {campaign.marca && <span>· {campaign.marca}</span>}
              {campaign.lineOfBusiness && <span>· {campaign.lineOfBusiness}</span>}
              <a href={googleAdsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800">
                Abrir en Google Ads <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </div>
          <div className="text-right text-xs text-gray-400">
            <p>
              Periodo: {PERIOD_LABEL[period]} · {kpis.dateFrom} → {kpis.dateTo}
            </p>
            {kpis.lastImport && (
              <p>
                Actualizado el <LocalDateTime date={kpis.lastImport.receivedAt} />
              </p>
            )}
            <p>Cambia el periodo desde la lista de campañas.</p>
          </div>
        </div>
      </div>

      <CampaignMappingForm
        campaignId={campaign.id}
        initial={{
          marca: campaign.marca,
          lineOfBusiness: campaign.lineOfBusiness,
          formIds: campaign.formIds,
          utmCampaign: campaign.utmCampaign,
          landingPath: campaign.landingPath,
          notes: campaign.notes,
        }}
        lineSuggestions={lineSuggestions}
        canEdit={canEdit}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <KpiCard key={c.label} {...c} />
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Evolución</h2>
          <p className="text-xs text-gray-400">{kpis.granularity === "day" ? "Por día" : "Por semana (ISO)"}</p>
        </div>
        <CampanasChart data={kpis.series} height={280} />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">Matriz de keywords</h2>
          <p className="text-xs text-gray-400">Qué palabras clave gastan más en el periodo. El QS es el actual, no el del periodo.</p>
        </div>
        <KeywordsTable rows={keywords} />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">Matriz de términos de búsqueda</h2>
          <p className="text-xs text-gray-400">Lo que escribió el usuario para que saltara el anuncio y cuánto costó. Excluir se hace en Google Ads.</p>
        </div>
        <SearchTermsTable rows={searchTerms} />
      </div>

      <AttributedLeads campaignId={campaign.id} leads={attributed} candidates={candidateOptions} />
    </div>
  );
}

function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}
