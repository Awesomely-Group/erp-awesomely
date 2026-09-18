import { json, badRequest, unauthorized } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { authenticateLeadsWebhook, isWebhookLeadSource } from "@/lib/leads-webhook";
import { MARCA_OPTIONS } from "@/lib/org";
import { CrmLeadOrigin, Prisma } from "@prisma/client";

const MARCA_VALUES = new Set(MARCA_OPTIONS.map((o) => o.value));
const ORIGIN_VALUES = new Set<string>(Object.values(CrmLeadOrigin));

interface LeadWebhookPayload {
  source: string;
  externalRef: string;
  name: string;
  marca: string;
  // Ver CrmStage.lineOfBusiness (revisión 2026-09-18) — default "GENERAL" si no se
  // envía. Solo tiene sentido pasar otra cosa si esa marca ya tiene más de un funnel
  // sembrado (ver scripts/seed-growth-crm.ts).
  lineOfBusiness?: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  amount?: number | null;
  campaignSource?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  notes?: string | null;
  // Impacto del plan de activación de Odoo (revisión 2026-09-18): mix inside-out/
  // outside-in, mercado (LaTroupe) y nº de usuarios propuestos (Odoo).
  origin?: string | null;
  market?: string | null;
  seats?: number | null;
}

/**
 * Entrada única de leads para Growth/CRM (D7, plan revisado 2026-09-18): sirve a los
 * formularios de gigsonsolutions.com/latroupestudio.com y al Workflow nativo de Apollo
 * (trigger "cambio de etapa" → acción "Send webhook", ver docs internas). El alta
 * manual desde el propio ERP NO pasa por aquí (server action en /crm, source: MANUAL).
 *
 * Auth: header `x-webhook-secret` contra `LEADS_WEBHOOK_SECRET` (ver
 * src/lib/leads-webhook.ts). Idempotente por (source, externalRef) — mismo patrón que
 * /api/webhooks/proposals.
 *
 * El lead entra en la primera etapa (`order` más bajo) del funnel de su marca y sin
 * `ownerId` (sin asignar) — hoy no hay ningún usuario con rol COMERCIAL todavía (D8);
 * un admin lo reparte a mano desde /crm.
 */
export async function POST(req: Request): Promise<Response> {
  if (!authenticateLeadsWebhook(req)) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Body JSON inválido");
  }

  const payload = body as Partial<LeadWebhookPayload>;

  if (!isWebhookLeadSource(payload.source)) {
    return badRequest("source inválido. Valores: WEB_GIGSON, WEB_LATROUPE, APOLLO, REFERIDO, OTRO");
  }
  if (!payload.externalRef) return badRequest("externalRef es obligatorio");
  if (!payload.name) return badRequest("name es obligatorio");
  if (!payload.marca || !MARCA_VALUES.has(payload.marca)) {
    return badRequest(`marca inválida. Valores: ${[...MARCA_VALUES].join(", ")}`);
  }
  if (!payload.email && !payload.phone) {
    return badRequest("email o phone es obligatorio (al menos uno)");
  }
  if (payload.origin !== undefined && payload.origin !== null && !ORIGIN_VALUES.has(payload.origin)) {
    return badRequest(`origin inválido. Valores: ${[...ORIGIN_VALUES].join(", ")}`);
  }

  const source = payload.source;
  const lineOfBusiness = payload.lineOfBusiness ?? "GENERAL";

  const existing = await prisma.crmLead.findUnique({
    where: { source_externalRef: { source, externalRef: payload.externalRef } },
    select: { id: true },
  });
  if (existing) {
    return json({ leadId: existing.id, idempotent: true }, 200);
  }

  const firstStage = await prisma.crmStage.findFirst({
    where: { marca: payload.marca, lineOfBusiness },
    orderBy: { order: "asc" },
  });
  if (!firstStage) {
    return json(
      {
        error: `No hay etapas configuradas (CrmStage) para "${payload.marca}" / línea "${lineOfBusiness}" — ejecutar scripts/seed-growth-crm.ts`,
      },
      500
    );
  }

  try {
    const lead = await prisma.crmLead.create({
      data: {
        name: payload.name,
        marca: payload.marca,
        lineOfBusiness,
        source,
        externalRef: payload.externalRef,
        contactName: payload.contactName ?? null,
        email: payload.email ?? null,
        phone: payload.phone ?? null,
        amount: payload.amount ?? null,
        campaignSource: payload.campaignSource ?? null,
        utmSource: payload.utmSource ?? null,
        utmMedium: payload.utmMedium ?? null,
        utmCampaign: payload.utmCampaign ?? null,
        notes: payload.notes ?? null,
        origin: (payload.origin as CrmLeadOrigin | null | undefined) ?? null,
        market: payload.market ?? null,
        seats: payload.seats ?? null,
        stageId: firstStage.id,
        stageEvents: {
          create: { toStageId: firstStage.id, trigger: "WEBHOOK" },
        },
      },
      select: { id: true },
    });
    return json({ leadId: lead.id }, 201);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const raced = await prisma.crmLead.findUnique({
        where: { source_externalRef: { source, externalRef: payload.externalRef } },
        select: { id: true },
      });
      if (raced) return json({ leadId: raced.id, idempotent: true });
    }
    const message = err instanceof Error ? err.message : "Error al crear el lead";
    return json({ error: message }, 500);
  }
}
