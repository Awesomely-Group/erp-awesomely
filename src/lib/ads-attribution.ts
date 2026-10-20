// Atribución lead → campaña de pago (Growth > Campañas, 2026-10-16). Lógica pura; la usa
// el webhook de leads al crear el lead y se puede corregir a mano desde la ficha.
//
// Cascada, de más a menos fiable:
//  1. `utm_campaign` casa exacto con el que tiene anotado una campaña mapeada. Es la señal
//     buena: solo la llevan las URLs finales de los anuncios.
//  2. `form_id` casa con los formIds de UNA sola campaña viva de la misma marca, y además el
//     lead trae señal de pago (gclid, o utm_medium cpc/ppc/paid). Sin esa señal no se
//     atribuye: la landing de Odoo la rellena también gente que llegó por Google orgánico,
//     y contarla como lead de campaña inflaría el CPL hacia abajo.
//  3. Si el formulario lo comparten varias campañas (las dos de Odoo apuntan a la misma
//     landing) no se decide: queda sin campaña y se vincula a mano.
//
// Descartado cruzar por el propio gclid: es opaco, no codifica la campaña. Lo que sí hace
// el gclid es decir "esto vino de un anuncio", y para eso se usa.

export interface AttributionInput {
  marca: string;
  utmCampaign?: string | null;
  utmMedium?: string | null;
  formId?: string | null;
  gclid?: string | null;
}

export interface AttributableCampaign {
  id: string;
  marca: string | null;
  utmCampaign: string | null;
  formIds: string[];
  /** AdCampaignStatus como texto; REMOVED queda fuera de la cascada. */
  status: string;
}

export type AttributionReason = "utm_campaign" | "form_id" | "ambiguous" | "none";

export interface AttributionResult {
  campaignId: string | null;
  reason: AttributionReason;
}

const norm = (v: string | null | undefined): string => (v ?? "").trim().toLowerCase();

export function hasPaidSignal(input: Pick<AttributionInput, "gclid" | "utmMedium">): boolean {
  if (norm(input.gclid)) return true;
  // "paid_social", "cpc", "ppc_brand"… El guion bajo cuenta como letra para \b, así que no vale.
  return /(^|[^a-z])(cpc|ppc|paid|sem)([^a-z]|$)/.test(norm(input.utmMedium));
}

export function resolveAdCampaign(input: AttributionInput, campaigns: ReadonlyArray<AttributableCampaign>): AttributionResult {
  const live = campaigns.filter((c) => c.status !== "REMOVED" && (c.marca === null || c.marca === input.marca));

  const utm = norm(input.utmCampaign);
  if (utm) {
    const byUtm = live.filter((c) => norm(c.utmCampaign) === utm);
    if (byUtm.length === 1) return { campaignId: byUtm[0].id, reason: "utm_campaign" };
    if (byUtm.length > 1) {
      // Varias con el mismo utm_campaign: la de la marca exacta gana; si siguen empatando, nadie.
      const sameMarca = byUtm.filter((c) => c.marca === input.marca);
      if (sameMarca.length === 1) return { campaignId: sameMarca[0].id, reason: "utm_campaign" };
      return { campaignId: null, reason: "ambiguous" };
    }
  }

  const formId = norm(input.formId);
  if (formId && hasPaidSignal(input)) {
    const byForm = live.filter((c) => c.formIds.some((f) => norm(f) === formId));
    if (byForm.length === 1) return { campaignId: byForm[0].id, reason: "form_id" };
    if (byForm.length > 1) return { campaignId: null, reason: "ambiguous" };
  }

  return { campaignId: null, reason: "none" };
}

/** gbraid/wbraid (iOS) se guardan en la misma columna que gclid, con prefijo. */
export function packClickId(ids: { gclid?: string | null; gbraid?: string | null; wbraid?: string | null }): string | null {
  const gclid = ids.gclid?.trim();
  if (gclid) return gclid;
  const gbraid = ids.gbraid?.trim();
  if (gbraid) return `gbraid:${gbraid}`;
  const wbraid = ids.wbraid?.trim();
  if (wbraid) return `wbraid:${wbraid}`;
  return null;
}
