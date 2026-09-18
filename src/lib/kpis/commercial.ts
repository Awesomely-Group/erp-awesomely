import { prisma } from "@/lib/prisma";
import type { KPIFilters, CommercialKPIs, CommercialFunnelStage } from "./types";

/**
 * KPIs comerciales de Growth/CRM (revisión 2026-09-18, impacto del plan de
 * activación de Odoo). Mismo patrón que el resto de src/lib/kpis/*: recibe
 * `KPIFilters` (aquí también `marca`/`lineOfBusiness`) y devuelve un objeto plano.
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

  const [leadsInPeriod, stages, openLeads] = await Promise.all([
    prisma.crmLead.findMany({
      where: { ...scopeWhere, createdAt: { gte: dateFrom, lt: dateTo } },
      include: { stage: true, stageEvents: { orderBy: { changedAt: "asc" } } },
    }),
    prisma.crmStage.findMany({ where: scopeWhere, orderBy: { order: "asc" } }),
    // Pipeline ponderado y funnel: foto actual, no acotada al periodo (un lead
    // abierto pudo crearse antes del rango filtrado y seguir vivo hoy).
    prisma.crmLead.findMany({
      where: { ...scopeWhere, stage: { isWon: false, isLost: false } },
      select: { amount: true, probability: true, stageId: true },
    }),
  ]);

  const leadsByOrigin: Record<string, number> = {};
  for (const lead of leadsInPeriod) {
    const key = lead.origin ?? "SIN_ORIGEN";
    leadsByOrigin[key] = (leadsByOrigin[key] ?? 0) + 1;
  }

  const wonLeads = leadsInPeriod.filter((l) => l.stage.isWon);
  const lostLeads = leadsInPeriod.filter((l) => l.stage.isLost);
  const closedCount = wonLeads.length + lostLeads.length;
  const winRatePct = closedCount > 0 ? (wonLeads.length / closedCount) * 100 : null;

  const dealSizes = wonLeads.map((l) => (l.amount !== null ? Number(l.amount) : null)).filter((v): v is number => v !== null);
  const avgDealSize = dealSizes.length > 0 ? dealSizes.reduce((a, b) => a + b, 0) / dealSizes.length : null;

  const cycleDays: number[] = [];
  for (const lead of wonLeads) {
    const created = lead.stageEvents[0]?.changedAt ?? lead.createdAt;
    const wonEvent = [...lead.stageEvents].reverse().find((e) => e.toStageId === lead.stageId);
    const wonAt = wonEvent?.changedAt ?? lead.updatedAt;
    const days = (wonAt.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
    if (days >= 0) cycleDays.push(days);
  }
  const avgCycleDays = cycleDays.length > 0 ? cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length : null;

  const weightedPipeline = openLeads.reduce((sum, l) => {
    const amount = l.amount !== null ? Number(l.amount) : 0;
    const probability = l.probability ?? 50; // sin dato, asume 50% en vez de excluirlo
    return sum + (amount * probability) / 100;
  }, 0);

  const openByStage = new Map<string, { count: number; amount: number }>();
  for (const l of openLeads) {
    const cur = openByStage.get(l.stageId) ?? { count: 0, amount: 0 };
    cur.count += 1;
    cur.amount += l.amount !== null ? Number(l.amount) : 0;
    openByStage.set(l.stageId, cur);
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
    wonCount: wonLeads.length,
    lostCount: lostLeads.length,
    winRatePct,
    avgDealSize,
    avgCycleDays,
    weightedPipeline,
    funnel,
  };
}
