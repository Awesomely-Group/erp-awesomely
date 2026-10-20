import { prisma } from "@/lib/prisma";
import { AdCampaignStatus, AdsImportKind, AdsImportResult } from "@prisma/client";
import type { CampaignKPIs, CampaignRow, KPIFilters } from "./types";
import {
  aggregateMetricSet,
  bucketByPeriod,
  budgetStatus,
  chooseGranularity,
  madridDateKey,
  type DailyStatInput,
  type LeadInput,
} from "./campaigns-math";

/**
 * KPIs de campañas de pago (Growth > Campañas, revisión 2026-10-16). Mismo patrón que el
 * resto de src/lib/kpis/*: recibe `KPIFilters` (aquí `marca`, `lineOfBusiness`,
 * `campaignId` y el rango) y devuelve un objeto plano.
 *
 * Qué mide, y de dónde: impresiones, clics, coste y conversiones vienen de Google Ads vía
 * el webhook de métricas (tablas ad_*); los leads vienen del CRM, atribuidos a la campaña
 * por `CrmLead.adCampaignId` y contados en su fecha de entrada — donde está su coste de
 * captación, igual que hace getCommercialKPIs. Hasta que la web llame al webhook de leads
 * con la atribución, ese enlace se hace a mano y "Leads CRM" puede ir por detrás de la
 * realidad; la UI lo avisa.
 *
 * El rango se trabaja en días ("YYYY-MM-DD"): las métricas de Ads son por fecha local de
 * la cuenta (columnas @db.Date) y mezclar instantes con fechas desplazaría un día al
 * agregar desde Vercel (UTC). Las fechas de los filtros se reducen a día con sus
 * componentes locales porque así las construye getDateRange.
 */
export async function getCampaignKPIs(filters: KPIFilters): Promise<CampaignKPIs> {
  const now = new Date();
  const year = filters.year ?? now.getFullYear();
  const dateFrom = filters.dateFrom ?? new Date(year, 0, 1);
  const dateTo = filters.dateTo ?? new Date(year, 11, 31);
  const fromIso = localDateKey(dateFrom);
  const toIso = localDateKey(dateTo);
  const todayIso = madridDateKey(now);
  const monthKey = todayIso.slice(0, 7);

  const campaignWhere = {
    ...(filters.marca ? { marca: filters.marca } : {}),
    ...(filters.lineOfBusiness ? { lineOfBusiness: filters.lineOfBusiness } : {}),
    ...(filters.campaignId ? { id: filters.campaignId } : {}),
  };

  const campaigns = await prisma.adCampaign.findMany({
    where: campaignWhere,
    select: {
      id: true,
      externalId: true,
      name: true,
      status: true,
      dailyBudget: true,
      marca: true,
      lineOfBusiness: true,
    },
    orderBy: { name: "asc" },
  });
  const campaignIds = campaigns.map((c) => c.id);

  const [stats, leads, monthSpent, lastImport] = await Promise.all([
    prisma.adCampaignDailyStat.findMany({
      where: { campaignId: { in: campaignIds }, date: { gte: utcDate(fromIso), lte: utcDate(toIso) } },
      select: {
        campaignId: true,
        date: true,
        impressions: true,
        clicks: true,
        costEur: true,
        conversions: true,
        lostIsBudget: true,
        lostIsRank: true,
      },
    }),
    prisma.crmLead.findMany({
      where: { adCampaignId: { in: campaignIds }, createdAt: { gte: dateFrom, lte: endOfDay(dateTo) } },
      select: {
        adCampaignId: true,
        createdAt: true,
        convertedAt: true,
        deals: { select: { stage: { select: { isWon: true } } } },
      },
    }),
    // Gasto del mes en curso, para el pacing: no depende del rango filtrado.
    prisma.adCampaignDailyStat.aggregate({
      _sum: { costEur: true },
      where: { campaignId: { in: campaignIds }, date: { gte: utcDate(`${monthKey}-01`) } },
    }),
    prisma.adsImport.findFirst({
      where: { kind: AdsImportKind.CAMPAIGNS, result: AdsImportResult.SUCCESS },
      orderBy: { receivedAt: "desc" },
      select: { receivedAt: true, runId: true },
    }),
  ]);

  const statInputs: DailyStatInput[] = stats.map((s) => ({
    campaignId: s.campaignId,
    date: s.date.toISOString().slice(0, 10),
    impressions: s.impressions,
    clicks: s.clicks,
    costEur: Number(s.costEur),
    conversions: Number(s.conversions),
    lostIsBudget: s.lostIsBudget !== null ? Number(s.lostIsBudget) : null,
    lostIsRank: s.lostIsRank !== null ? Number(s.lostIsRank) : null,
  }));
  const leadInputs: LeadInput[] = leads
    .filter((l): l is typeof l & { adCampaignId: string } => l.adCampaignId !== null)
    .map((l) => ({
      campaignId: l.adCampaignId,
      date: madridDateKey(l.createdAt),
      qualified: l.convertedAt !== null,
      won: l.deals.some((d) => d.stage.isWon),
    }));

  const granularity = chooseGranularity(fromIso, toIso);
  const totals = aggregateMetricSet(statInputs, leadInputs);
  const series = bucketByPeriod(statInputs, leadInputs, granularity, fromIso, toIso);

  const rows: CampaignRow[] = campaigns.map((c) => {
    const own = statInputs.filter((s) => s.campaignId === c.id);
    const ownLeads = leadInputs.filter((l) => l.campaignId === c.id);
    const lastDate = own.reduce<string | null>((acc, s) => (acc === null || s.date > acc ? s.date : acc), null);
    return {
      ...aggregateMetricSet(own, ownLeads),
      campaignId: c.id,
      externalId: c.externalId,
      name: c.name,
      status: c.status,
      marca: c.marca,
      lineOfBusiness: c.lineOfBusiness,
      dailyBudgetEur: c.dailyBudget !== null ? Number(c.dailyBudget) : null,
      isMapped: c.marca !== null && c.lineOfBusiness !== null,
      lastDate,
    };
  });

  // Presupuesto: solo cuenta lo que Google puede gastar hoy (campañas activas).
  const activeBudget = campaigns
    .filter((c) => c.status === AdCampaignStatus.ENABLED && c.dailyBudget !== null)
    .reduce((sum, c) => sum + Number(c.dailyBudget), 0);
  const budget = budgetStatus({
    monthKey,
    todayIso,
    spentMtdEur: Number(monthSpent._sum.costEur ?? 0),
    dailyBudgetEur: activeBudget > 0 ? activeBudget : null,
  });

  let lastImportOut: CampaignKPIs["lastImport"] = null;
  if (lastImport) {
    const kinds = await prisma.adsImport.findMany({
      where: { runId: lastImport.runId, result: AdsImportResult.SUCCESS },
      select: { kind: true },
      distinct: ["kind"],
    });
    lastImportOut = {
      receivedAt: lastImport.receivedAt.toISOString(),
      runId: lastImport.runId,
      kinds: kinds.map((k) => k.kind),
    };
  }
  const staleHours = lastImport ? (now.getTime() - lastImport.receivedAt.getTime()) / 3_600_000 : null;

  return {
    marca: filters.marca,
    lineOfBusiness: filters.lineOfBusiness,
    campaignId: filters.campaignId,
    dateFrom: fromIso,
    dateTo: toIso,
    granularity,
    totals,
    budget,
    series,
    campaigns: rows,
    lastImport: lastImportOut,
    staleHours,
  };
}

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function utcDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function endOfDay(d: Date): Date {
  const e = new Date(d);
  if (e.getHours() === 0 && e.getMinutes() === 0 && e.getSeconds() === 0) e.setHours(23, 59, 59, 999);
  return e;
}
