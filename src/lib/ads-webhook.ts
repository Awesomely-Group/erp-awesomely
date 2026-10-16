// Contrato y auth de POST /api/webhooks/ads-metrics (Growth > Campañas, 2026-10-16).
//
// Quien llama es un Google Ads Script que corre dentro de la propia cuenta de Ads
// (scripts/google-ads/push-metrics.js), no una persona ni otra app nuestra. Manda tres
// tipos de lote por ejecución — campañas (con sus filas diarias), keywords y términos de
// búsqueda — y cada lote puede venir troceado en partes. Cada POST es autocontenido e
// idempotente: el servidor borra y reinserta las combinaciones (campaña, día) que trae el
// lote, así que repetirlo deja la base igual.
//
// Mismo secreto compartido que leads-webhook.ts (`x-webhook-secret`), por la misma razón:
// hay una sola cuenta de Ads y un solo script; un secreto por cuenta sería ceremonia.
//
// Aquí vive solo lo puro (schemas, normalización, auth del header) para poder testearlo
// sin base de datos; la escritura en Prisma está en ads-ingest.ts.
import { z, type ZodError } from "zod";

export const ADS_WEBHOOK_MAX_ROWS = 5000;

export function authenticateAdsWebhook(req: Request): boolean {
  const provided = req.headers.get("x-webhook-secret");
  const expected = process.env.ADS_WEBHOOK_SECRET;
  return !!provided && !!expected && provided === expected;
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

/** "YYYY-MM-DD", fecha local de la cuenta de Ads, sin hora ni zona. */
const isoDate = z.iso.date();
/** Importes ya en EUR: el script convierte los micros de Google antes de enviar. */
const money = z.number().finite().nonnegative();
const count = z.number().int().nonnegative();
/** Google devuelve conversiones fraccionales con atribución basada en datos. */
const conversions = z.number().finite().nonnegative();
/** Cuotas de impresiones, 0-1. null cuando Google no las da por falta de volumen. */
const share = z.number().min(0).max(1).nullish();
/** campaign.id, ad_group.id, criterion_id… int64 de Google, siempre como texto. */
const googleId = z.string().regex(/^\d{1,20}$/, "id numérico de Google Ads");

const base = z
  .object({
    /** Uno por ejecución del script; repetido en todos sus POST. */
    runId: z.string().min(8).max(64),
    scriptVersion: z.string().min(1).max(40),
    account: z.object({
      /** customer id sin guiones ("8272097041") */
      externalId: z.string().regex(/^\d{10}$/, "customer id de 10 dígitos sin guiones"),
      name: z.string().min(1).max(200),
      currency: z.string().length(3),
    }),
    dateFrom: isoDate,
    dateTo: isoDate,
    part: z.number().int().min(1),
    parts: z.number().int().min(1),
  })
  .refine((v) => v.dateFrom <= v.dateTo, { message: "dateFrom debe ser <= dateTo", path: ["dateFrom"] })
  .refine((v) => v.part <= v.parts, { message: "part debe ser <= parts", path: ["part"] });

export const campaignStatusSchema = z.enum(["ENABLED", "PAUSED", "REMOVED", "UNKNOWN"]);

const campaignMetaSchema = z.object({
  externalId: googleId,
  name: z.string().min(1).max(300),
  status: campaignStatusSchema,
  dailyBudgetEur: money.nullish(),
});

const campaignDailyRowSchema = z.object({
  campaignExternalId: googleId,
  date: isoDate,
  impressions: count,
  clicks: count,
  costEur: money,
  conversions,
  conversionValueEur: money.nullish(),
  dailyBudgetEur: money.nullish(),
  searchImprShare: share,
  lostIsBudget: share,
  lostIsRank: share,
});

const keywordRowSchema = z.object({
  campaignExternalId: googleId,
  adGroupId: googleId,
  adGroupName: z.string().min(1).max(300),
  criterionId: googleId,
  keywordText: z.string().min(1).max(300),
  matchType: z.string().min(1).max(30),
  date: isoDate,
  impressions: count,
  clicks: count,
  costEur: money,
  conversions,
  qualityScore: z.number().int().min(1).max(10).nullish(),
});

const searchTermRowSchema = z.object({
  campaignExternalId: googleId,
  adGroupId: googleId,
  adGroupName: z.string().min(1).max(300),
  searchTerm: z.string().min(1).max(500),
  matchType: z.string().min(1).max(30),
  status: z.string().max(30).nullish(),
  date: isoDate,
  impressions: count,
  clicks: count,
  costEur: money,
  conversions,
});

export const campaignsPayloadSchema = base.safeExtend({
  kind: z.literal("campaigns"),
  campaigns: z.array(campaignMetaSchema).max(500),
  rows: z.array(campaignDailyRowSchema).max(ADS_WEBHOOK_MAX_ROWS),
});

export const keywordsPayloadSchema = base.safeExtend({
  kind: z.literal("keywords"),
  rows: z.array(keywordRowSchema).max(ADS_WEBHOOK_MAX_ROWS),
});

export const searchTermsPayloadSchema = base.safeExtend({
  kind: z.literal("search_terms"),
  rows: z.array(searchTermRowSchema).max(ADS_WEBHOOK_MAX_ROWS),
});

export const adsMetricsPayloadSchema = z.discriminatedUnion("kind", [
  campaignsPayloadSchema,
  keywordsPayloadSchema,
  searchTermsPayloadSchema,
]);

export type AdsMetricsPayload = z.infer<typeof adsMetricsPayloadSchema>;
export type CampaignsPayload = z.infer<typeof campaignsPayloadSchema>;
export type KeywordsPayload = z.infer<typeof keywordsPayloadSchema>;
export type SearchTermsPayload = z.infer<typeof searchTermsPayloadSchema>;
export type CampaignMeta = z.infer<typeof campaignMetaSchema>;
export type CampaignDailyRow = z.infer<typeof campaignDailyRowSchema>;
export type KeywordRow = z.infer<typeof keywordRowSchema>;
export type SearchTermRow = z.infer<typeof searchTermRowSchema>;

// ─── Helpers puros ────────────────────────────────────────────────────────────

/**
 * "2026-10-16" → Date a medianoche UTC. Las columnas son `@db.Date`: Prisma guarda la
 * parte de fecha en UTC, así que construirla en UTC es lo que evita que un volcado a las
 * 04:00 de Madrid acabe en el día anterior. Mismo criterio que ExchangeRate.
 */
export function dateOnlyToUtc(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/** Primeras incidencias de zod, legibles, para la respuesta 400 (no el árbol entero). */
export function summarizeIssues(error: ZodError, max = 10): string[] {
  return error.issues.slice(0, max).map((issue) => {
    const path = issue.path.length > 0 ? issue.path.map(String).join(".") : "(raíz)";
    return `${path}: ${issue.message}`;
  });
}

/** externalId de campaña → fechas distintas que trae el lote, para borrar y reinsertar. */
export function datesByCampaign(rows: ReadonlyArray<{ campaignExternalId: string; date: string }>): Map<string, string[]> {
  const sets = new Map<string, Set<string>>();
  for (const row of rows) {
    const set = sets.get(row.campaignExternalId) ?? new Set<string>();
    set.add(row.date);
    sets.set(row.campaignExternalId, set);
  }
  const out = new Map<string, string[]>();
  for (const [campaign, set] of sets) out.set(campaign, [...set].sort());
  return out;
}
