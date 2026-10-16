import { describe, expect, it } from "vitest";
import {
  aggregateMetricSet,
  bucketByPeriod,
  budgetStatus,
  chooseGranularity,
  isoWeekKey,
  isoWeekStart,
  madridDateKey,
  weekLabel,
  type DailyStatInput,
  type LeadInput,
} from "./campaigns-math";

const stat = (over: Partial<DailyStatInput>): DailyStatInput => ({
  campaignId: "c1",
  date: "2026-10-16",
  impressions: 100,
  clicks: 8,
  costEur: 6.5,
  conversions: 1,
  lostIsBudget: null,
  lostIsRank: null,
  ...over,
});
const lead = (over: Partial<LeadInput>): LeadInput => ({ campaignId: "c1", date: "2026-10-16", qualified: false, won: false, ...over });

describe("aggregateMetricSet", () => {
  // Los cuatro KPIs de Holdmin: CTR, CPC, tasa de conversión, CPL — más la versión CRM.
  it("calcula CTR, CPC, conversión y CPL en sus dos versiones (Ads y CRM)", () => {
    const m = aggregateMetricSet(
      [stat({ date: "2026-10-16", impressions: 120, clicks: 9, costEur: 6.84, conversions: 1 }), stat({ date: "2026-10-17", impressions: 80, clicks: 7, costEur: 5.16, conversions: 0 })],
      [lead({ qualified: true, won: true }), lead({ date: "2026-10-17" })],
    );
    expect(m.impressions).toBe(200);
    expect(m.clicks).toBe(16);
    expect(m.costEur).toBe(12);
    expect(m.ctrPct).toBe(8);
    expect(m.cpcEur).toBe(0.75);
    expect(m.convRateAdsPct).toBeCloseTo(6.25);
    expect(m.convRateCrmPct).toBe(12.5);
    expect(m.cplAdsEur).toBe(12);
    expect(m.cplCrmEur).toBe(6);
    expect(m.cplQualifiedEur).toBe(12);
    expect(m.cpaEur).toBe(12);
  });

  // Agosto 2026: 45 clics y 0 formularios. El CPL no es infinito, es "no hay dato".
  it("devuelve null, no Infinity, cuando el denominador es 0", () => {
    const m = aggregateMetricSet([stat({ clicks: 45, conversions: 0 })], []);
    expect(m.cplAdsEur).toBeNull();
    expect(m.cplCrmEur).toBeNull();
    expect(m.convRateCrmPct).toBe(0);
    const empty = aggregateMetricSet([], []);
    expect(empty.ctrPct).toBeNull();
    expect(empty.cpcEur).toBeNull();
  });

  it("pondera la cuota perdida por impresiones e ignora los días sin dato", () => {
    const m = aggregateMetricSet(
      [
        stat({ impressions: 100, lostIsBudget: 0.6 }),
        stat({ date: "2026-10-17", impressions: 300, lostIsBudget: 0.2 }),
        stat({ date: "2026-10-18", impressions: 50, lostIsBudget: null }),
      ],
      [],
    );
    expect(m.lostIsBudgetPct).toBeCloseTo(30);
    expect(m.lostIsRankPct).toBeNull();
  });
});

describe("semanas ISO", () => {
  it("el 1 de enero de 2027 cae en la semana 53 de 2026", () => {
    expect(isoWeekKey("2027-01-01")).toBe("2026-W53");
    expect(isoWeekStart("2027-01-01")).toBe("2026-12-28");
  });

  it("el 16 de octubre de 2026 es la S42 que empieza el lunes 12", () => {
    expect(isoWeekKey("2026-10-16")).toBe("2026-W42");
    expect(isoWeekStart("2026-10-16")).toBe("2026-10-12");
    expect(weekLabel("2026-10-16")).toBe("S42 · 12 oct");
  });
});

describe("bucketByPeriod", () => {
  it("rellena los días sin datos con ceros para que la gráfica no tenga huecos", () => {
    const series = bucketByPeriod([stat({ date: "2026-10-16" }), stat({ date: "2026-10-18" })], [], "day", "2026-10-16", "2026-10-18");
    expect(series.map((p) => p.periodKey)).toEqual(["2026-10-16", "2026-10-17", "2026-10-18"]);
    expect(series[1].impressions).toBe(0);
    expect(series[1].ctrPct).toBeNull();
    expect(series[0].label).toBe("16 oct");
  });

  it("por semanas agrupa desde el lunes de la primera y cuenta el lead en su semana", () => {
    const series = bucketByPeriod(
      [stat({ date: "2026-10-16" }), stat({ date: "2026-10-20" })],
      [lead({ date: "2026-10-21" })],
      "week",
      "2026-10-14",
      "2026-10-21",
    );
    expect(series.map((p) => p.periodKey)).toEqual(["2026-10-12".replace("2026-10-12", "2026-W42"), "2026-W43"]);
    expect(series[0].clicks).toBe(8);
    expect(series[1].leadsCrm).toBe(1);
  });

  it("elige día hasta 45 días y semana a partir de ahí", () => {
    expect(chooseGranularity("2026-10-01", "2026-10-31")).toBe("day");
    expect(chooseGranularity("2026-09-01", "2026-10-31")).toBe("week");
  });
});

describe("budgetStatus", () => {
  // Odoo: 7 €/día + 3 €/día = 10 €/día. A 16 de octubre lo esperado son 160 €.
  it("calcula el presupuesto del mes y el ritmo a mitad de mes", () => {
    const b = budgetStatus({ monthKey: "2026-10", todayIso: "2026-10-16", spentMtdEur: 144, dailyBudgetEur: 10 });
    expect(b.monthlyBudgetEur).toBe(310);
    expect(b.expectedToDateEur).toBe(160);
    expect(b.pacePct).toBeCloseTo(90);
  });

  it("para un mes ya cerrado compara contra el mes entero", () => {
    const b = budgetStatus({ monthKey: "2026-09", todayIso: "2026-10-16", spentMtdEur: 300, dailyBudgetEur: 10 });
    expect(b.expectedToDateEur).toBe(300);
    expect(b.pacePct).toBe(100);
  });

  it("sin presupuesto conocido no inventa ritmo", () => {
    const b = budgetStatus({ monthKey: "2026-10", todayIso: "2026-10-16", spentMtdEur: 12.5, dailyBudgetEur: null });
    expect(b.monthlyBudgetEur).toBeNull();
    expect(b.pacePct).toBeNull();
    expect(b.spentMtdEur).toBe(12.5);
  });
});

describe("madridDateKey", () => {
  // Un lead a las 23:30 UTC del 16 ya es del 17 en Madrid (CEST, +2).
  it("usa la fecha de Madrid, no la UTC", () => {
    expect(madridDateKey(new Date("2026-10-16T23:30:00.000Z"))).toBe("2026-10-17");
    expect(madridDateKey(new Date("2026-10-16T10:00:00.000Z"))).toBe("2026-10-16");
  });
});
