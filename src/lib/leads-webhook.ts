// Auth compartida para POST /api/webhooks/leads (D7, plan Growth/CRM 2026-09-18).
//
// A diferencia de proposals-brand.ts (un secreto por marca), aquí se usa un único
// secreto compartido: los 3 canales de entrada (formularios de gigsonsolutions.com /
// latroupestudio.com, y el Workflow nativo de Apollo que envía el webhook al cambiar
// de etapa un contacto) no se corresponden 1:1 con una marca — Apollo en particular es
// una única cuenta cruzada a las 2 marcas, la marca real viene en el payload
// (`CrmLead.marca`), no en el canal. Simplificación deliberada respecto al patrón de
// proposals-brand.ts.
import { CrmLeadSource } from "@prisma/client";

const WEBHOOK_SOURCES: CrmLeadSource[] = [
  CrmLeadSource.WEB_GIGSON,
  CrmLeadSource.WEB_LATROUPE,
  CrmLeadSource.APOLLO,
  CrmLeadSource.REFERIDO,
  CrmLeadSource.OTRO,
];

export function isWebhookLeadSource(value: unknown): value is CrmLeadSource {
  return typeof value === "string" && (WEBHOOK_SOURCES as string[]).includes(value);
}

export function authenticateLeadsWebhook(req: Request): boolean {
  const provided = req.headers.get("x-webhook-secret");
  const expected = process.env.LEADS_WEBHOOK_SECRET;
  return !!provided && !!expected && provided === expected;
}
