import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ADS_WEBHOOK_MAX_ROWS,
  adsMetricsPayloadSchema,
  authenticateAdsWebhook,
  dateOnlyToUtc,
  datesByCampaign,
  summarizeIssues,
} from "./ads-webhook";

const FIXTURES = join(process.cwd(), "scripts/google-ads/fixtures");
const fixture = (name: string): unknown => JSON.parse(readFileSync(join(FIXTURES, name), "utf8"));

describe("adsMetricsPayloadSchema", () => {
  // Los fixtures son los mismos que se usan con curl para probar el webhook: si el
  // contrato cambia, tienen que seguir pasando por aquí.
  it.each(["campaigns.json", "keywords.json", "search_terms.json"])("acepta el fixture %s", (name) => {
    const parsed = adsMetricsPayloadSchema.safeParse(fixture(name));
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it("rechaza métricas negativas y fechas al revés", () => {
    const base = fixture("campaigns.json") as { rows: Array<Record<string, unknown>>; dateFrom: string; dateTo: string };
    const negative = { ...base, rows: [{ ...base.rows[0], clicks: -1 }] };
    expect(adsMetricsPayloadSchema.safeParse(negative).success).toBe(false);

    const reversed = { ...base, dateFrom: base.dateTo, dateTo: base.dateFrom };
    const result = adsMetricsPayloadSchema.safeParse(reversed);
    expect(result.success).toBe(false);
    if (!result.success) expect(summarizeIssues(result.error)[0]).toContain("dateFrom");
  });

  // Google devuelve "< 10 %" como 0.0999 y nada cuando no hay volumen: las dos formas
  // tienen que entrar, y la cuota nunca puede ser > 1.
  it("admite cuotas de impresiones nulas o ausentes, pero no mayores que 1", () => {
    const base = fixture("campaigns.json") as { rows: Array<Record<string, unknown>> };
    const row = base.rows[0];
    const withoutShare = Object.fromEntries(Object.entries(row).filter(([key]) => key !== "searchImprShare"));
    expect(adsMetricsPayloadSchema.safeParse({ ...base, rows: [withoutShare] }).success).toBe(true);
    expect(adsMetricsPayloadSchema.safeParse({ ...base, rows: [{ ...row, lostIsBudget: null }] }).success).toBe(true);
    expect(adsMetricsPayloadSchema.safeParse({ ...base, rows: [{ ...row, lostIsRank: 1.2 }] }).success).toBe(false);
  });

  it("limita el tamaño del lote", () => {
    const base = fixture("keywords.json") as { rows: Array<Record<string, unknown>> };
    const tooMany = { ...base, rows: Array.from({ length: ADS_WEBHOOK_MAX_ROWS + 1 }, () => base.rows[0]) };
    expect(adsMetricsPayloadSchema.safeParse(tooMany).success).toBe(false);
  });

  it("rechaza un kind desconocido con un mensaje que lo nombra", () => {
    const result = adsMetricsPayloadSchema.safeParse({ ...(fixture("campaigns.json") as object), kind: "ads" });
    expect(result.success).toBe(false);
    if (!result.success) expect(summarizeIssues(result.error)[0]).toMatch(/kind/);
  });
});

describe("dateOnlyToUtc", () => {
  // El script corre a las 04:00 de Madrid; si la fecha se construyera en local, un
  // servidor en UTC guardaría el día anterior.
  it("construye la medianoche UTC del día indicado", () => {
    const d = dateOnlyToUtc("2026-10-16");
    expect(d.toISOString()).toBe("2026-10-16T00:00:00.000Z");
    expect(d.getUTCDate()).toBe(16);
  });
});

describe("datesByCampaign", () => {
  it("agrupa fechas únicas y ordenadas por campaña", () => {
    const map = datesByCampaign([
      { campaignExternalId: "2", date: "2026-10-17" },
      { campaignExternalId: "1", date: "2026-10-16" },
      { campaignExternalId: "2", date: "2026-10-16" },
      { campaignExternalId: "2", date: "2026-10-17" },
    ]);
    expect(map.get("1")).toEqual(["2026-10-16"]);
    expect(map.get("2")).toEqual(["2026-10-16", "2026-10-17"]);
  });
});

describe("authenticateAdsWebhook", () => {
  const req = (secret?: string): Request =>
    new Request("http://erp.test/api/webhooks/ads-metrics", {
      method: "POST",
      headers: secret ? { "x-webhook-secret": secret } : {},
    });

  it("exige que el secreto esté configurado y coincida", () => {
    const prev = process.env.ADS_WEBHOOK_SECRET;
    try {
      delete process.env.ADS_WEBHOOK_SECRET;
      expect(authenticateAdsWebhook(req("x"))).toBe(false);
      process.env.ADS_WEBHOOK_SECRET = "s3cret";
      expect(authenticateAdsWebhook(req())).toBe(false);
      expect(authenticateAdsWebhook(req("otro"))).toBe(false);
      expect(authenticateAdsWebhook(req("s3cret"))).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.ADS_WEBHOOK_SECRET;
      else process.env.ADS_WEBHOOK_SECRET = prev;
    }
  });
});
