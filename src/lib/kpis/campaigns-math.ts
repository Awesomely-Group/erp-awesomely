// Matemática pura de los KPIs de campañas de pago (sin Prisma, testeable). La consulta
// y el ensamblado están en campaigns.ts.
//
// Fórmulas (reunión con Holdmin, 2026-10-16): CTR = clics/impresiones; CPC = coste/clics;
// tasa de conversión = leads/clics; CPL = coste/leads. Cada ratio sale en dos versiones:
// con las conversiones que cuenta Google Ads (dependen de las cookies: un mínimo) y con
// los leads reales del CRM atribuidos a la campaña, que es la cifra que manda.
// Denominador 0 → null, nunca Infinity (misma convención que commercial.ts).
import type { CampaignBudgetStatus, CampaignMetricSet, CampaignSeriesPoint } from "./types";

export type Granularity = "day" | "week";

/** Fila diaria ya normalizada: `date` es "YYYY-MM-DD" (fecha local de la cuenta de Ads). */
export interface DailyStatInput {
  campaignId: string;
  date: string;
  impressions: number;
  clicks: number;
  costEur: number;
  conversions: number;
  lostIsBudget: number | null;
  lostIsRank: number | null;
}

/** Lead del CRM atribuido a una campaña; `date` es el día de entrada, en hora de Madrid. */
export interface LeadInput {
  campaignId: string;
  date: string;
  qualified: boolean;
  won: boolean;
}

export function ratio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return numerator / denominator;
}

function pct(numerator: number, denominator: number): number | null {
  const r = ratio(numerator, denominator);
  return r === null ? null : r * 100;
}

export function emptyMetricSet(): CampaignMetricSet {
  return {
    impressions: 0,
    clicks: 0,
    costEur: 0,
    conversionsAds: 0,
    leadsCrm: 0,
    leadsQualified: 0,
    dealsWon: 0,
    ctrPct: null,
    cpcEur: null,
    convRateAdsPct: null,
    convRateCrmPct: null,
    cplAdsEur: null,
    cplCrmEur: null,
    cplQualifiedEur: null,
    cpaEur: null,
    lostIsBudgetPct: null,
    lostIsRankPct: null,
  };
}

/**
 * Agrega filas diarias y leads en un conjunto de métricas. Las cuotas de impresiones
 * perdidas se ponderan por impresiones servidas — aproximación (Google las calcula sobre
 * las impresiones elegibles), suficiente para ver si el freno es el presupuesto o el ranking.
 */
export function aggregateMetricSet(stats: ReadonlyArray<DailyStatInput>, leads: ReadonlyArray<LeadInput>): CampaignMetricSet {
  const m = emptyMetricSet();
  let lostBudgetWeighted = 0;
  let lostBudgetWeight = 0;
  let lostRankWeighted = 0;
  let lostRankWeight = 0;

  for (const s of stats) {
    m.impressions += s.impressions;
    m.clicks += s.clicks;
    m.costEur += s.costEur;
    m.conversionsAds += s.conversions;
    if (s.lostIsBudget !== null && s.impressions > 0) {
      lostBudgetWeighted += s.lostIsBudget * s.impressions;
      lostBudgetWeight += s.impressions;
    }
    if (s.lostIsRank !== null && s.impressions > 0) {
      lostRankWeighted += s.lostIsRank * s.impressions;
      lostRankWeight += s.impressions;
    }
  }
  for (const l of leads) {
    m.leadsCrm += 1;
    if (l.qualified) m.leadsQualified += 1;
    if (l.won) m.dealsWon += 1;
  }

  m.costEur = round2(m.costEur);
  m.ctrPct = pct(m.clicks, m.impressions);
  m.cpcEur = ratio(m.costEur, m.clicks);
  m.convRateAdsPct = pct(m.conversionsAds, m.clicks);
  m.convRateCrmPct = pct(m.leadsCrm, m.clicks);
  m.cplAdsEur = ratio(m.costEur, m.conversionsAds);
  m.cplCrmEur = ratio(m.costEur, m.leadsCrm);
  m.cplQualifiedEur = ratio(m.costEur, m.leadsQualified);
  m.cpaEur = ratio(m.costEur, m.dealsWon);
  m.lostIsBudgetPct = pct(lostBudgetWeighted, lostBudgetWeight);
  m.lostIsRankPct = pct(lostRankWeighted, lostRankWeight);
  return m;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Fechas ───────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

function parseIsoDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" del instante dado en hora de Madrid (la de la cuenta de Ads y la del equipo). */
export function madridDateKey(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** Lunes (ISO) de la semana a la que pertenece el día. */
export function isoWeekStart(iso: string): string {
  const d = parseIsoDate(iso);
  const dow = (d.getUTCDay() + 6) % 7; // lunes = 0
  return toIso(new Date(d.getTime() - dow * DAY_MS));
}

/** "2026-W42" según ISO 8601 (la semana 1 es la que contiene el primer jueves). */
export function isoWeekKey(iso: string): string {
  const d = parseIsoDate(iso);
  const dow = (d.getUTCDay() + 6) % 7;
  const thursday = new Date(d.getTime() + (3 - dow) * DAY_MS);
  const isoYear = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDow = (firstThursday.getUTCDay() + 6) % 7;
  const week1Monday = new Date(firstThursday.getTime() - firstDow * DAY_MS);
  const week = Math.floor((thursday.getTime() - week1Monday.getTime()) / (7 * DAY_MS)) + 1;
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

const DAY_LABEL = new Intl.DateTimeFormat("es-ES", { timeZone: "UTC", day: "numeric", month: "short" });

export function dayLabel(iso: string): string {
  return DAY_LABEL.format(parseIsoDate(iso)).replace(".", "");
}

export function weekLabel(iso: string): string {
  const weekKey = isoWeekKey(iso);
  return `S${weekKey.slice(-2)} · ${dayLabel(isoWeekStart(iso))}`;
}

/** Más de 45 días se leen mejor por semanas; menos, por días. */
export function chooseGranularity(dateFromIso: string, dateToIso: string): Granularity {
  const days = (parseIsoDate(dateToIso).getTime() - parseIsoDate(dateFromIso).getTime()) / DAY_MS + 1;
  return days > 45 ? "week" : "day";
}

/**
 * Serie temporal con todos los periodos del rango, también los vacíos (una gráfica con
 * huecos engaña: parece que no hubo gasto cuando lo que no hubo fue volcado).
 */
export function bucketByPeriod(
  stats: ReadonlyArray<DailyStatInput>,
  leads: ReadonlyArray<LeadInput>,
  granularity: Granularity,
  dateFromIso: string,
  dateToIso: string,
): CampaignSeriesPoint[] {
  const keyOf = (iso: string): string => (granularity === "day" ? iso : isoWeekStart(iso));
  const labelOf = (iso: string): string => (granularity === "day" ? dayLabel(iso) : weekLabel(iso));

  const statsByKey = new Map<string, DailyStatInput[]>();
  for (const s of stats) {
    const k = keyOf(s.date);
    statsByKey.set(k, [...(statsByKey.get(k) ?? []), s]);
  }
  const leadsByKey = new Map<string, LeadInput[]>();
  for (const l of leads) {
    const k = keyOf(l.date);
    leadsByKey.set(k, [...(leadsByKey.get(k) ?? []), l]);
  }

  const points: CampaignSeriesPoint[] = [];
  const start = parseIsoDate(granularity === "day" ? dateFromIso : isoWeekStart(dateFromIso));
  const end = parseIsoDate(dateToIso);
  const step = granularity === "day" ? DAY_MS : 7 * DAY_MS;
  for (let t = start.getTime(); t <= end.getTime(); t += step) {
    const key = toIso(new Date(t));
    points.push({
      ...aggregateMetricSet(statsByKey.get(key) ?? [], leadsByKey.get(key) ?? []),
      periodKey: granularity === "day" ? key : isoWeekKey(key),
      label: labelOf(key),
    });
  }
  return points;
}

// ─── Presupuesto ─────────────────────────────────────────────────────────────

function daysInMonth(monthKey: string): number {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * Gasto del mes frente al presupuesto: `monthlyBudgetEur` = presupuesto diario × días del
 * mes; `expectedToDateEur` = presupuesto diario × días transcurridos (hoy incluido, que es
 * como lo gasta Google); `pacePct` = gastado / esperado. 100 % = al ritmo; por debajo,
 * Google no encuentra en qué gastarlo (poca demanda); por encima, sobregasto.
 */
export function budgetStatus(input: {
  monthKey: string;
  todayIso: string;
  spentMtdEur: number;
  dailyBudgetEur: number | null;
}): CampaignBudgetStatus {
  const { monthKey, todayIso, spentMtdEur, dailyBudgetEur } = input;
  const inMonth = todayIso.startsWith(monthKey);
  const dayOfMonth = inMonth ? Number(todayIso.slice(-2)) : daysInMonth(monthKey);
  const monthlyBudgetEur = dailyBudgetEur !== null ? round2(dailyBudgetEur * daysInMonth(monthKey)) : null;
  const expectedToDateEur = dailyBudgetEur !== null ? round2(dailyBudgetEur * dayOfMonth) : null;
  const pace = expectedToDateEur !== null ? ratio(spentMtdEur, expectedToDateEur) : null;
  return {
    monthKey,
    spentMtdEur: round2(spentMtdEur),
    dailyBudgetEur,
    monthlyBudgetEur,
    expectedToDateEur,
    pacePct: pace === null ? null : pace * 100,
  };
}
