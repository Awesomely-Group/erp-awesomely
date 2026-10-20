import { describe, expect, it } from "vitest";
import { hasPaidSignal, packClickId, resolveAdCampaign, type AttributableCampaign } from "./ads-attribution";

// Las dos campañas reales de Odoo (16/10/2026): misma landing, mismo formulario.
const implantacion: AttributableCampaign = {
  id: "c-impl",
  marca: "Gigson Solutions",
  utmCampaign: "odoo_implantacion",
  formIds: ["consultoria-odoo"],
  status: "ENABLED",
};
const ampliaciones: AttributableCampaign = {
  id: "c-ampl",
  marca: "Gigson Solutions",
  utmCampaign: "odoo_ampliaciones",
  formIds: ["consultoria-odoo"],
  status: "ENABLED",
};
const iso: AttributableCampaign = { id: "c-iso", marca: "Gigson Solutions", utmCampaign: null, formIds: ["iso27001"], status: "PAUSED" };
const removed: AttributableCampaign = { id: "c-old", marca: "Gigson Solutions", utmCampaign: "odoo_implantacion", formIds: [], status: "REMOVED" };
const all = [implantacion, ampliaciones, iso, removed];
const marca = "Gigson Solutions";

describe("resolveAdCampaign", () => {
  it("atribuye por utm_campaign exacto, ignorando mayúsculas, espacios y campañas eliminadas", () => {
    expect(resolveAdCampaign({ marca, utmCampaign: " Odoo_Implantacion " }, all)).toEqual({ campaignId: "c-impl", reason: "utm_campaign" });
  });

  // El caso que motivó la regla: las dos campañas de Odoo comparten formulario.
  it("no decide cuando el formulario lo comparten dos campañas", () => {
    expect(resolveAdCampaign({ marca, formId: "consultoria-odoo", gclid: "Cj0KCQ" }, all)).toEqual({ campaignId: null, reason: "ambiguous" });
  });

  it("atribuye por form_id solo si el formulario es de una campaña y el lead trae señal de pago", () => {
    expect(resolveAdCampaign({ marca, formId: "iso27001", gclid: "abc" }, all)).toEqual({ campaignId: "c-iso", reason: "form_id" });
    expect(resolveAdCampaign({ marca, formId: "iso27001", utmMedium: "cpc" }, all)).toEqual({ campaignId: "c-iso", reason: "form_id" });
    // Orgánico: misma landing, sin anuncio detrás.
    expect(resolveAdCampaign({ marca, formId: "iso27001" }, all)).toEqual({ campaignId: null, reason: "none" });
  });

  it("no cruza marcas", () => {
    expect(resolveAdCampaign({ marca: "LaTroupe", utmCampaign: "odoo_implantacion" }, all)).toEqual({ campaignId: null, reason: "none" });
  });

  it("una campaña sin marca vale para cualquier marca", () => {
    const generic: AttributableCampaign = { id: "c-gen", marca: null, utmCampaign: "brand", formIds: [], status: "ENABLED" };
    expect(resolveAdCampaign({ marca: "LaTroupe", utmCampaign: "brand" }, [generic])).toEqual({ campaignId: "c-gen", reason: "utm_campaign" });
  });
});

describe("hasPaidSignal", () => {
  it("reconoce gclid y los utm_medium habituales de pago", () => {
    expect(hasPaidSignal({ gclid: "x" })).toBe(true);
    expect(hasPaidSignal({ utmMedium: "CPC" })).toBe(true);
    expect(hasPaidSignal({ utmMedium: "paid_social" })).toBe(true);
    expect(hasPaidSignal({ utmMedium: "organic" })).toBe(false);
    expect(hasPaidSignal({})).toBe(false);
  });
});

describe("packClickId", () => {
  it("prefiere gclid y prefija los identificadores de iOS", () => {
    expect(packClickId({ gclid: "g1", gbraid: "b1" })).toBe("g1");
    expect(packClickId({ gbraid: "b1" })).toBe("gbraid:b1");
    expect(packClickId({ wbraid: " w1 " })).toBe("wbraid:w1");
    expect(packClickId({})).toBeNull();
  });
});
