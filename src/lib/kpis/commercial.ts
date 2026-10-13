import { prisma } from "@/lib/prisma";
import type { KPIFilters, CommercialKPIs, CommercialFunnelStage } from "./types";

/**
 * KPIs comerciales de Growth/CRM (revisión 2026-09-18, impacto del plan de
 * activación de Odoo). Mismo patrón que el resto de src/lib/kpis/*: recibe
 * `KPIFilters` (aquí también `marca`/`lineOfBusiness`) y devuelve un objeto plano.
 *
 * Mide dos embudos encadenados, que es lo que permitió separar lead de deal
 * (2026-10-13): el del LEAD, que va de la entrada a la cualificación y responde "¿llega
 * bastante gente y de dónde?", y el del DEAL, que va de la cualificación al cierre y
 * responde "¿cerramos lo que trabajamos?". Mezclarlos escondía el problema: con una
 * sola entidad, cien leads de formulario que no valían nada hundían el win rate del
 * comercial que cerraba bien lo poco que le llegaba.
 *
 * `dealType` (revisión 2026-09-20) acota los deals pero NO se aplica por defecto: el
 * pipeline ponderado es dinero real y una ampliación de retainer cuenta igual que una
 * venta nueva. Lo que sí distorsiona la mezcla son los objetivos de captación, y esos
 * se piden con el filtro puesto. El desglose `dealsByType` sale siempre para que la
 * proporción se vea sin lanzar otra consulta.
 *
 * Si no se pasa `marca`, se agrega sobre todas las marcas/líneas a la vez — útil
 * para una vista consolidada, pero las conversiones dejan de tener el sentido por
 * embudo que motivó `lineOfBusiness`; el caller debería normalmente iterar por
 * marca/línea (ver /crm, que ya lo hace para el tablero).
 */
export async function getCommercialKPIs(filters: KPIFilters): Promise<CommercialKPIs> {
  const year = filters.year ?? new Date().getFullYear();
  const dateFrom = filters.dateFrom ?? new Date(year, 0, 1);
  const dateTo = filters.dateTo ?? new Date(year + 1, 0, 1);

  const scopeWhere = {
    ...(filters.marca ? { marca: filters.marca } : {}),
    ...(filters.lineOfBusiness ? { lineOfBusiness: filters.lineOfBusiness } : {}),
  };
  // El tipo de operación solo acota los deals: ni el lead ni las etapas lo tienen.
  const dealWhere = {
    ...scopeWhere,
    ...(filters.dealType ? { dealType: filters.dealType } : {}),
  };

  const [leadsInPeriod, dealsInPeriod, stages, openDeals] = await Promise.all([
    prisma.crmLead.findMany({
      where: { ...scopeWhere, createdAt: { gte: dateFrom, lt: dateTo } },
      select: { id: true, origin: true, convertedAt: true, createdAt: true },
    }),
    prisma.crmDeal.findMany({
      where: { ...dealWhere, createdAt: { gte: dateFrom, lt: dateTo } },
      include: {
        stage: true,
        stageEvents: { orderBy: { changedAt: "asc" } },
        sourceLead: { select: { createdAt: true, convertedAt: true } },
      },
    }),
    prisma.crmStage.findMany({ where: scopeWhere, orderBy: { order: "asc" } }),
    // Pipeline ponderado y funnel: foto actual, no acotada al periodo (una oportunidad
    // abierta pudo crearse antes del rango filtrado y seguir viva hoy).
    prisma.crmDeal.findMany({
      where: { ...dealWhere, stage: { isWon: false, isLost: false } },
      select: { amount: true, probability: true, stageId: true },
    }),
  ]);

  const leadsByOrigin: Record<string, number> = {};
  for (const lead of leadsInPeriod) {
    const key = lead.origin ?? "SIN_ORIGEN";
    leadsByOrigin[key] = (leadsByOrigin[key] ?? 0) + 1;
  }

  // Se cuenta sobre los leads ENTRADOS en el periodo, no sobre los cualificados en él:
  // la pregunta es qué parte de lo que entró sirvió para algo. Un lead de diciembre que
  // se cualifica en enero cuenta en diciembre, donde está su coste de captación.
  const leadsQualified = leadsInPeriod.filter((l) => l.convertedAt !== null).length;
  const qualificationRatePct =
    leadsInPeriod.length > 0 ? (leadsQualified / leadsInPeriod.length) * 100 : null;

  const dealsByType: Record<string, number> = {};
  for (const deal of dealsInPeriod) {
    dealsByType[deal.dealType] = (dealsByType[deal.dealType] ?? 0) + 1;
  }

  const wonDeals = dealsInPeriod.filter((d) => d.stage.isWon);
  const lostDeals = dealsInPeriod.filter((d) => d.stage.isLost);
  const closedCount = wonDeals.length + lostDeals.length;
  const winRatePct = closedCount > 0 ? (wonDeals.length / closedCount) * 100 : null;

  const dealSizes = wonDeals
    .map((d) => (d.amount !== null ? Number(d.amount) : null))
    .filter((v): v is number => v !== null);
  const avgDealSize = dealSizes.length > 0 ? dealSizes.reduce((a, b) => a + b, 0) / dealSizes.length : null;

  const cycleDays: number[] = [];
  for (const deal of wonDeals) {
    const created = deal.stageEvents[0]?.changedAt ?? deal.createdAt;
    const wonEvent = [...deal.stageEvents].reverse().find((e) => e.toStageId === deal.stageId);
    const wonAt = wonEvent?.changedAt ?? deal.updatedAt;
    const days = (wonAt.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
    if (days >= 0) cycleDays.push(days);
  }
  const avgCycleDays = cycleDays.length > 0 ? cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length : null;

  // Solo para los deals que nacieron de un lead: los que surgen de un cliente que ya
  // tenemos no pasaron por cualificación y meterlos como 0 días bajaría la media de algo
  // que no han hecho.
  const qualifyDays: number[] = [];
  for (const deal of wonDeals) {
    const lead = deal.sourceLead;
    if (!lead?.convertedAt) continue;
    const days = (lead.convertedAt.getTime() - lead.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (days >= 0) qualifyDays.push(days);
  }
  const avgTimeToQualifyDays =
    qualifyDays.length > 0 ? qualifyDays.reduce((a, b) => a + b, 0) / qualifyDays.length : null;

  const weightedPipeline = openDeals.reduce((sum, d) => {
    const amount = d.amount !== null ? Number(d.amount) : 0;
    const probability = d.probability ?? 50; // sin dato, asume 50% en vez de excluirlo
    return sum + (amount * probability) / 100;
  }, 0);

  const openByStage = new Map<string, { count: number; amount: number }>();
  for (const d of openDeals) {
    const cur = openByStage.get(d.stageId) ?? { count: 0, amount: 0 };
    cur.count += 1;
    cur.amount += d.amount !== null ? Number(d.amount) : 0;
    openByStage.set(d.stageId, cur);
  }
  const funnel: CommercialFunnelStage[] = stages.map((s) => ({
    stageId: s.id,
    stageName: s.name,
    order: s.order,
    isWon: s.isWon,
    isLost: s.isLost,
    openCount: openByStage.get(s.id)?.count ?? 0,
    openAmount: openByStage.get(s.id)?.amount ?? 0,
  }));

  return {
    marca: filters.marca,
    lineOfBusiness: filters.lineOfBusiness,
    dateFrom: dateFrom.toISOString(),
    dateTo: dateTo.toISOString(),
    leadsCreated: leadsInPeriod.length,
    leadsByOrigin,
    leadsQualified,
    qualificationRatePct,
    dealsCreated: dealsInPeriod.length,
    dealsByType,
    wonCount: wonDeals.length,
    lostCount: lostDeals.length,
    winRatePct,
    avgDealSize,
    avgCycleDays,
    avgTimeToQualifyDays,
    weightedPipeline,
    funnel,
  };
}
