import { json, badRequest, unauthorized } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { adsMetricsPayloadSchema, authenticateAdsWebhook, dateOnlyToUtc, summarizeIssues } from "@/lib/ads-webhook";
import { ingestAdsMetrics } from "@/lib/ads-ingest";
import { AdsImportKind, AdsImportResult, AdsPlatform } from "@prisma/client";

// 5.000 filas por POST con borrado previo: lejos del minuto, pero no de los 10 s por defecto.
export const maxDuration = 60;

const KIND_BY_PAYLOAD: Record<"campaigns" | "keywords" | "search_terms", AdsImportKind> = {
  campaigns: AdsImportKind.CAMPAIGNS,
  keywords: AdsImportKind.KEYWORDS,
  search_terms: AdsImportKind.SEARCH_TERMS,
};

/**
 * Entrada de métricas de campañas de pago (Growth > Campañas, 2026-10-16). La llama el
 * Google Ads Script de scripts/google-ads/push-metrics.js cada madrugada con los últimos
 * 60 días, en tres lotes (campaigns → keywords → search_terms), cada uno troceable.
 *
 * Auth: header `x-webhook-secret` contra `ADS_WEBHOOK_SECRET` (ver src/lib/ads-webhook.ts).
 * Idempotente: repetir un POST deja la base igual (ver src/lib/ads-ingest.ts). Cada POST
 * deja una fila en `ads_imports`, también cuando falla — es lo que /campanas usa para decir
 * "actualizado hace N horas" y avisar si el script dejó de llegar.
 *
 * Nunca toca el mapeo manual de las campañas (marca, línea, formIds, utmCampaign).
 */
export async function POST(req: Request): Promise<Response> {
  if (!authenticateAdsWebhook(req)) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Body JSON inválido");
  }

  const parsed = adsMetricsPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "Payload inválido", issues: summarizeIssues(parsed.error) }, 400);
  }
  const payload = parsed.data;

  // Fuera del try de abajo no habría fila en ads_imports que registrar (aún no hay cuenta),
  // pero el error tiene que salir como JSON igualmente y no como un 500 vacío.
  let accountId: string;
  try {
    const account = await prisma.adsAccount.upsert({
      where: { platform_externalId: { platform: AdsPlatform.GOOGLE_ADS, externalId: payload.account.externalId } },
      update: { name: payload.account.name, currency: payload.account.currency },
      create: {
        platform: AdsPlatform.GOOGLE_ADS,
        externalId: payload.account.externalId,
        name: payload.account.name,
        currency: payload.account.currency,
      },
      select: { id: true },
    });
    accountId = account.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al resolver la cuenta de Ads";
    console.error("[ads-metrics] fallo al hacer upsert de la cuenta:", err);
    return json({ error: message }, 500);
  }

  const importBase = {
    accountId,
    kind: KIND_BY_PAYLOAD[payload.kind],
    runId: payload.runId,
    scriptVersion: payload.scriptVersion,
    dateFrom: dateOnlyToUtc(payload.dateFrom),
    dateTo: dateOnlyToUtc(payload.dateTo),
    rowsReceived: payload.rows.length,
  };

  try {
    const result = await ingestAdsMetrics(payload, accountId);
    const imported = await prisma.adsImport.create({
      data: { ...importBase, result: AdsImportResult.SUCCESS, rowsUpserted: result.rowsUpserted },
      select: { id: true },
    });
    return json({
      importId: imported.id,
      kind: payload.kind,
      part: payload.part,
      parts: payload.parts,
      rowsReceived: payload.rows.length,
      rowsUpserted: result.rowsUpserted,
      campaignsCreated: result.campaignsCreated,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al ingerir las métricas";
    await prisma.adsImport
      .create({ data: { ...importBase, result: AdsImportResult.ERROR, rowsUpserted: 0, errorMessage: message.slice(0, 2000) } })
      .catch((logErr: unknown) => console.error("[ads-metrics] no se pudo registrar el import fallido:", logErr));
    return json({ error: message }, 500);
  }
}
