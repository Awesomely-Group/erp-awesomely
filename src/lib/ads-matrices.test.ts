import { describe, expect, it } from "vitest";
import { aggregateKeywords, aggregateSearchTerms, type KeywordStatRow, type SearchTermStatRow } from "./ads-matrices";

const kw = (over: Partial<KeywordStatRow>): KeywordStatRow => ({
  adGroupId: "g1",
  adGroupName: "Implantación Odoo",
  criterionId: "k1",
  keywordText: "implantación odoo",
  matchType: "EXACT",
  date: "2026-10-16",
  impressions: 70,
  clicks: 6,
  costEur: 4.5,
  conversions: 1,
  qualityScore: null,
  ...over,
});
const st = (over: Partial<SearchTermStatRow>): SearchTermStatRow => ({
  adGroupId: "g1",
  adGroupName: "Implantación Odoo",
  searchTerm: "odoo precio licencia",
  matchType: "NEAR_PHRASE",
  status: "NONE",
  date: "2026-10-16",
  impressions: 22,
  clicks: 3,
  costEur: 2.1,
  conversions: 0,
  ...over,
});

describe("aggregateKeywords", () => {
  it("suma los días de cada keyword, calcula ratios y ordena por gasto", () => {
    const rows = aggregateKeywords([
      kw({ date: "2026-10-16", qualityScore: null }),
      kw({ date: "2026-10-18", impressions: 90, clicks: 8, costEur: 5.1, conversions: 1, qualityScore: 6 }),
      kw({ criterionId: "k2", keywordText: "consultoría odoo", impressions: 50, clicks: 3, costEur: 2.34, conversions: 0 }),
    ]);
    expect(rows.map((r) => r.keywordText)).toEqual(["implantación odoo", "consultoría odoo"]);
    const main = rows[0];
    expect(main.impressions).toBe(160);
    expect(main.clicks).toBe(14);
    expect(main.costEur).toBe(9.6);
    expect(main.conversions).toBe(2);
    expect(main.ctrPct).toBeCloseTo(8.75);
    expect(main.cplEur).toBe(4.8);
    expect(rows[1].cplEur).toBeNull();
  });

  // Google solo da el QS "de hoy": el script lo manda en el último día y aquí se toma ese.
  it("se queda con el quality score del día más reciente, aunque llegue desordenado", () => {
    const rows = aggregateKeywords([kw({ date: "2026-10-18", qualityScore: 6 }), kw({ date: "2026-10-17", qualityScore: 4 }), kw({ date: "2026-10-16" })]);
    expect(rows[0].qualityScore).toBe(6);
  });
});

describe("aggregateSearchTerms", () => {
  it("marca como candidato a negativa el término que gasta clics sin convertir", () => {
    const rows = aggregateSearchTerms([
      st({ date: "2026-10-16", clicks: 2 }),
      st({ date: "2026-10-17", clicks: 1, costEur: 0.9 }),
      st({ searchTerm: "implantación odoo", matchType: "EXACT", status: "ADDED", clicks: 5, costEur: 3.6, conversions: 1 }),
    ]);
    const precio = rows.find((r) => r.searchTerm === "odoo precio licencia");
    expect(precio?.clicks).toBe(3);
    expect(precio?.costEur).toBe(3);
    expect(precio?.isNegativeCandidate).toBe(true);
    expect(rows.find((r) => r.searchTerm === "implantación odoo")?.isNegativeCandidate).toBe(false);
  });

  it("un término ya excluido no es candidato, y el estado que manda es el más reciente", () => {
    const rows = aggregateSearchTerms([st({ date: "2026-10-16", status: "NONE", clicks: 4 }), st({ date: "2026-10-18", status: "EXCLUDED", clicks: 0, costEur: 0 })]);
    expect(rows[0].status).toBe("EXCLUDED");
    expect(rows[0].isNegativeCandidate).toBe(false);
  });

  it("el mismo término por dos concordancias son dos filas", () => {
    const rows = aggregateSearchTerms([st({ matchType: "BROAD" }), st({ matchType: "PHRASE" })]);
    expect(rows).toHaveLength(2);
  });
});
