import { json, badRequest, unauthorized } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { authenticateLeadsWebhook, isWebhookLeadSource } from "@/lib/leads-webhook";
import { MARCA_OPTIONS } from "@/lib/org";
import { packClickId, resolveAdCampaign } from "@/lib/ads-attribution";
import { AdCampaignStatus, CrmOrigin, Prisma } from "@prisma/client";

const MARCA_VALUES = new Set(MARCA_OPTIONS.map((o) => o.value));
const ORIGIN_VALUES = new Set<string>(Object.values(CrmOrigin));

interface LeadWebhookPayload {
  source: string;
  externalRef: string;
  name: string;
  marca: string;
  // Ver CrmStage.lineOfBusiness (revisión 2026-09-18) — default "GENERAL" si no se
  // envía. Determina en qué embudo caerá el deal cuando se cualifique el lead.
  lineOfBusiness?: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  /** Presupuesto declarado por quien rellena el formulario. Orientativo. */
  amount?: number | null;
  campaignSource?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  // Atribución a campañas de pago (Growth > Campañas, 2026-10-16). Son los campos que ya
  // captura la web (gigson-marketing, src/lib/attribution.ts): con ellos el lead se cuelga
  // de su AdCampaign (ver src/lib/ads-attribution.ts) y sale en el CPL real de /campanas.
  utmTerm?: string | null;
  utmContent?: string | null;
  gclid?: string | null;
  gbraid?: string | null;
  wbraid?: string | null;
  /** form_id del formulario de la web ("consultoria-odoo", "iso27001", "home"…). */
  formId?: string | null;
  landingPage?: string | null;
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
 * Atribución a campañas de pago (2026-10-16): si el payload trae `utmCampaign`/`formId`
 * (+ gclid o utm_medium de pago) que casan con una AdCampaign mapeada, el lead nace con
 * `adCampaignId` y cuenta en el CPL de /campanas. La respuesta dice qué regla aplicó.
 *
 * El lead entra como NEW y sin `ownerId` (sin asignar) — hoy no hay ningún usuario con
 * rol COMERCIAL todavía (D8); un admin lo reparte a mano desde /crm/leads. NO entra en
 * el embudo: el embudo es de deals, y el deal nace al cualificar el lead (separación
 * lead/deal del 2026-10-13). `amount` y `seats` se guardan como lo declarado y siembran
 * ese primer deal.
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
  const gclid = packClickId(payload);

  const existing = await prisma.crmLead.findUnique({
    where: { source_externalRef: { source, externalRef: payload.externalRef } },
    select: { id: true },
  });
  if (existing) {
    return json({ leadId: existing.id, idempotent: true }, 200);
  }

  // Campañas vivas para la atribución automática. Si no hay ninguna mapeada, el lead entra
  // igual, sin campaña: el enlace se puede hacer a mano desde la ficha.
  const campaigns = await prisma.adCampaign.findMany({
    where: { status: { not: AdCampaignStatus.REMOVED } },
    select: { id: true, marca: true, utmCampaign: true, formIds: true, status: true },
  });
  const attribution = resolveAdCampaign(
    { marca: payload.marca, utmCampaign: payload.utmCampaign, utmMedium: payload.utmMedium, formId: payload.formId, gclid },
    campaigns,
  );

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
        estimatedAmount: payload.amount ?? null,
        campaignSource: payload.campaignSource ?? null,
        utmSource: payload.utmSource ?? null,
        utmMedium: payload.utmMedium ?? null,
        utmCampaign: payload.utmCampaign ?? null,
        utmTerm: payload.utmTerm ?? null,
        utmContent: payload.utmContent ?? null,
        gclid,
        formId: payload.formId ?? null,
        landingPage: payload.landingPage ?? null,
        adCampaignId: attribution.campaignId,
        notes: payload.notes ?? null,
        origin: (payload.origin as CrmOrigin | null | undefined) ?? null,
        market: payload.market ?? null,
        seats: payload.seats ?? null,
      },
      select: { id: true },
    });
    return json({ leadId: lead.id, adCampaignId: attribution.campaignId, attribution: attribution.reason }, 201);
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
