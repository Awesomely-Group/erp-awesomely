"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin, requireSession } from "@/lib/roles";
import { MARCA_OPTIONS } from "@/lib/org";
import { revalidatePath } from "next/cache";

export interface CampaignMappingPayload {
  marca: string | null;
  lineOfBusiness: string | null;
  /** form_id de la web, separados por coma en el formulario. */
  formIds: string[];
  utmCampaign: string | null;
  landingPath: string | null;
  notes: string | null;
}

/**
 * Mapeo manual de una campaña (Growth > Campañas, 2026-10-16): marca, línea de negocio,
 * formularios y utm_campaign. Es lo único de la campaña que no viene de Google, y es lo
 * que permite cruzarla con los leads del CRM. Solo ADMIN: el rol COMERCIAL ve /campanas
 * pero no decide a qué línea pertenece una campaña.
 */
export async function updateAdCampaignMapping(campaignId: string, payload: CampaignMappingPayload): Promise<void> {
  await requireAdmin();

  const marca = payload.marca && MARCA_OPTIONS.some((m) => m.value === payload.marca) ? payload.marca : null;
  const clean = (v: string | null): string | null => {
    const t = v?.trim() ?? "";
    return t.length > 0 ? t : null;
  };
  const formIds = [...new Set(payload.formIds.map((f) => f.trim().toLowerCase()).filter((f) => f.length > 0))];

  await prisma.adCampaign.update({
    where: { id: campaignId },
    data: {
      marca,
      lineOfBusiness: clean(payload.lineOfBusiness)?.toUpperCase() ?? null,
      formIds,
      utmCampaign: clean(payload.utmCampaign),
      landingPath: clean(payload.landingPath),
      notes: clean(payload.notes),
    },
  });

  revalidatePath("/campanas");
  revalidatePath(`/campanas/${campaignId}`);
}

/**
 * Vincula (o desvincula, con null) un lead a una campaña de pago. Mismo criterio que
 * `linkLeadToAccount` en crm/actions.ts: cualquier usuario con sesión, porque es corregir
 * un dato del lead, no decidir la estructura de las campañas.
 */
export async function linkLeadToAdCampaign(leadId: string, campaignId: string | null): Promise<void> {
  await requireSession();
  const lead = await prisma.crmLead.findUnique({ where: { id: leadId }, select: { adCampaignId: true } });
  if (!lead) throw new Error("Lead no encontrado");

  await prisma.crmLead.update({ where: { id: leadId }, data: { adCampaignId: campaignId } });

  revalidatePath(`/crm/leads/${leadId}`);
  revalidatePath("/campanas");
  if (campaignId) revalidatePath(`/campanas/${campaignId}`);
  if (lead.adCampaignId && lead.adCampaignId !== campaignId) revalidatePath(`/campanas/${lead.adCampaignId}`);
}
