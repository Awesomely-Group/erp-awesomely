// Escritura en Prisma de los lotes de POST /api/webhooks/ads-metrics. Separado de
// ads-webhook.ts (puro, testeable) para que la ruta quede en: autenticar → validar →
// ingerir → registrar AdsImport.
//
// Idempotencia por borrado y reinserción de las combinaciones (campaña, día) presentes
// en el lote, en una transacción. Un upsert fila a fila con clave de cuatro o cinco
// columnas habría sido más lento y no habría eliminado las filas que Google deja de
// reportar (p.ej. una keyword borrada). Los días que no vienen en ningún lote no se
// tocan: así una ejecución troceada en partes no se pisa a sí misma.
import { prisma } from "@/lib/prisma";
import { AdCampaignStatus, type Prisma } from "@prisma/client";
import {
  dateOnlyToUtc,
  datesByCampaign,
  type AdsMetricsPayload,
  type CampaignMeta,
} from "@/lib/ads-webhook";

export interface IngestResult {
  rowsUpserted: number;
  /** externalIds de campañas que no existían y se han dado de alta en este lote. */
  campaignsCreated: string[];
}

type Tx = Prisma.TransactionClient;

/**
 * Da de alta/actualiza las campañas que trae el lote y devuelve externalId → id.
 *
 * Solo toca nombre, estado y presupuesto (lo que Google sabe). Marca, línea de negocio,
 * formIds y utmCampaign los rellena una persona en /campanas y NO se pisan aquí. Si llega
 * un lote de keywords o términos de una campaña que aún no conocemos (el lote de campañas
 * falló o llegó después), se crea mínima con el id como nombre antes que perder filas.
 */
async function ensureCampaigns(
  tx: Tx,
  accountId: string,
  externalIds: ReadonlySet<string>,
  meta: ReadonlyArray<CampaignMeta>,
): Promise<{ idByExternal: Map<string, string>; created: string[] }> {
  const metaByExternal = new Map(meta.map((m) => [m.externalId, m]));
  const wanted = new Set<string>([...externalIds, ...metaByExternal.keys()]);

  const existing = await tx.adCampaign.findMany({
    where: { accountId, externalId: { in: [...wanted] } },
    select: { id: true, externalId: true },
  });
  const idByExternal = new Map(existing.map((c) => [c.externalId, c.id]));
  const created: string[] = [];

  for (const externalId of wanted) {
    const m = metaByExternal.get(externalId);
    const knownId = idByExternal.get(externalId);
    if (knownId) {
      if (m) {
        await tx.adCampaign.update({
          where: { id: knownId },
          data: {
            name: m.name,
            status: AdCampaignStatus[m.status],
            dailyBudget: m.dailyBudgetEur ?? null,
          },
        });
      }
      continue;
    }
    const row = await tx.adCampaign.create({
      data: {
        accountId,
        externalId,
        name: m?.name ?? `Campaña ${externalId}`,
        status: m ? AdCampaignStatus[m.status] : AdCampaignStatus.UNKNOWN,
        dailyBudget: m?.dailyBudgetEur ?? null,
      },
      select: { id: true },
    });
    idByExternal.set(externalId, row.id);
    created.push(externalId);
  }

  return { idByExternal, created };
}

function campaignIdOrThrow(idByExternal: Map<string, string>, externalId: string): string {
  const id = idByExternal.get(externalId);
  if (!id) throw new Error(`Campaña ${externalId} sin id interno tras ensureCampaigns`);
  return id;
}

export async function ingestAdsMetrics(payload: AdsMetricsPayload, accountId: string): Promise<IngestResult> {
  return prisma.$transaction(
    async (tx) => {
      const byCampaign = datesByCampaign(payload.rows);
      const meta = payload.kind === "campaigns" ? payload.campaigns : [];
      const { idByExternal, created } = await ensureCampaigns(tx, accountId, new Set(byCampaign.keys()), meta);

      // Borrado de la ventana que trae el lote, campaña a campaña.
      for (const [externalId, dates] of byCampaign) {
        const campaignId = campaignIdOrThrow(idByExternal, externalId);
        const where = { campaignId, date: { in: dates.map(dateOnlyToUtc) } };
        if (payload.kind === "campaigns") await tx.adCampaignDailyStat.deleteMany({ where });
        else if (payload.kind === "keywords") await tx.adKeywordStat.deleteMany({ where });
        else await tx.adSearchTermStat.deleteMany({ where });
      }

      let rowsUpserted = 0;
      if (payload.kind === "campaigns") {
        const data: Prisma.AdCampaignDailyStatCreateManyInput[] = payload.rows.map((r) => ({
          campaignId: campaignIdOrThrow(idByExternal, r.campaignExternalId),
          date: dateOnlyToUtc(r.date),
          impressions: r.impressions,
          clicks: r.clicks,
          costEur: r.costEur,
          conversions: r.conversions,
          conversionValueEur: r.conversionValueEur ?? 0,
          dailyBudgetEur: r.dailyBudgetEur ?? null,
          searchImprShare: r.searchImprShare ?? null,
          lostIsBudget: r.lostIsBudget ?? null,
          lostIsRank: r.lostIsRank ?? null,
        }));
        rowsUpserted = (await tx.adCampaignDailyStat.createMany({ data })).count;
      } else if (payload.kind === "keywords") {
        const data: Prisma.AdKeywordStatCreateManyInput[] = payload.rows.map((r) => ({
          campaignId: campaignIdOrThrow(idByExternal, r.campaignExternalId),
          adGroupId: r.adGroupId,
          adGroupName: r.adGroupName,
          criterionId: r.criterionId,
          keywordText: r.keywordText,
          matchType: r.matchType,
          date: dateOnlyToUtc(r.date),
          impressions: r.impressions,
          clicks: r.clicks,
          costEur: r.costEur,
          conversions: r.conversions,
          qualityScore: r.qualityScore ?? null,
        }));
        // skipDuplicates: el mismo criterio puede venir repetido si el script lo pide dos veces.
        rowsUpserted = (await tx.adKeywordStat.createMany({ data, skipDuplicates: true })).count;
      } else {
        const data: Prisma.AdSearchTermStatCreateManyInput[] = payload.rows.map((r) => ({
          campaignId: campaignIdOrThrow(idByExternal, r.campaignExternalId),
          adGroupId: r.adGroupId,
          adGroupName: r.adGroupName,
          searchTerm: r.searchTerm,
          matchType: r.matchType,
          status: r.status ?? null,
          date: dateOnlyToUtc(r.date),
          impressions: r.impressions,
          clicks: r.clicks,
          costEur: r.costEur,
          conversions: r.conversions,
        }));
        rowsUpserted = (await tx.adSearchTermStat.createMany({ data, skipDuplicates: true })).count;
      }

      return { rowsUpserted, campaignsCreated: created };
    },
    // 5.000 filas en createMany más los borrados: holgado, pero por encima de los 5 s por defecto.
    { timeout: 30_000 },
  );
}
