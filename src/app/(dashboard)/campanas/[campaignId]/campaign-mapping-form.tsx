"use client";

import { useState, useTransition } from "react";
import { MARCA_OPTIONS } from "@/lib/org";
import { updateAdCampaignMapping } from "../actions";

export interface CampaignMappingValues {
  marca: string | null;
  lineOfBusiness: string | null;
  formIds: string[];
  utmCampaign: string | null;
  landingPath: string | null;
  notes: string | null;
}

/**
 * Lo que Google no sabe de la campaña y hay que decirle al ERP: a qué marca y línea de
 * negocio pertenece, qué formularios de la web la alimentan y qué utm_campaign llevan sus
 * anuncios. Es el puente con los leads del CRM (ver src/lib/ads-attribution.ts).
 */
export function CampaignMappingForm({
  campaignId,
  initial,
  lineSuggestions,
  canEdit,
}: {
  campaignId: string;
  initial: CampaignMappingValues;
  lineSuggestions: string[];
  canEdit: boolean;
}): React.JSX.Element {
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [marca, setMarca] = useState(initial.marca ?? "");
  const [lineOfBusiness, setLineOfBusiness] = useState(initial.lineOfBusiness ?? "");
  const [formIds, setFormIds] = useState(initial.formIds.join(", "));
  const [utmCampaign, setUtmCampaign] = useState(initial.utmCampaign ?? "");
  const [landingPath, setLandingPath] = useState(initial.landingPath ?? "");
  const [notes, setNotes] = useState(initial.notes ?? "");

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    setSaved(false);
    setError(null);
    startTransition(async () => {
      try {
        await updateAdCampaignMapping(campaignId, {
          marca: marca || null,
          lineOfBusiness: lineOfBusiness || null,
          formIds: formIds.split(",").map((f) => f.trim()).filter(Boolean),
          utmCampaign: utmCampaign || null,
          landingPath: landingPath || null,
          notes: notes || null,
        });
        setSaved(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar");
      }
    });
  }

  const input = "w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-50 disabled:text-gray-500";
  const isMapped = Boolean(initial.marca && initial.lineOfBusiness);

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Mapeo con el CRM</h2>
        {!isMapped && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">sin mapear</span>}
      </div>
      <p className="mt-1 text-xs text-gray-400">
        Marca y línea de negocio hacen que la campaña entre en los filtros y se cruce con los leads. El <code>utm_campaign</code> es lo
        que atribuye un lead automáticamente; los formularios solo cuentan si no los comparte otra campaña y el lead trae gclid.
      </p>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="text-xs text-gray-500">
          Marca
          <select value={marca} onChange={(e) => setMarca(e.target.value)} disabled={!canEdit || isPending} className={`${input} mt-1`}>
            <option value="">— Sin marca —</option>
            {MARCA_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-500">
          Línea de negocio
          <input
            list="campaign-line-suggestions"
            value={lineOfBusiness}
            onChange={(e) => setLineOfBusiness(e.target.value)}
            disabled={!canEdit || isPending}
            placeholder="ODOO, ISO27001, IA…"
            className={`${input} mt-1 uppercase`}
          />
          <datalist id="campaign-line-suggestions">
            {lineSuggestions.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </label>
        <label className="text-xs text-gray-500">
          utm_campaign de los anuncios
          <input
            value={utmCampaign}
            onChange={(e) => setUtmCampaign(e.target.value)}
            disabled={!canEdit || isPending}
            placeholder="p.ej. odoo_implantacion"
            className={`${input} mt-1`}
          />
        </label>
        <label className="text-xs text-gray-500">
          Formularios de la web (form_id, separados por coma)
          <input
            value={formIds}
            onChange={(e) => setFormIds(e.target.value)}
            disabled={!canEdit || isPending}
            placeholder="consultoria-odoo"
            className={`${input} mt-1`}
          />
        </label>
        <label className="text-xs text-gray-500">
          Landing
          <input
            value={landingPath}
            onChange={(e) => setLandingPath(e.target.value)}
            disabled={!canEdit || isPending}
            placeholder="/es/consultoria-odoo"
            className={`${input} mt-1`}
          />
        </label>
        <label className="text-xs text-gray-500">
          Notas
          <input value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canEdit || isPending} className={`${input} mt-1`} />
        </label>
      </div>

      <div className="mt-3 flex items-center gap-3">
        {canEdit ? (
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
          >
            {isPending ? "Guardando…" : "Guardar mapeo"}
          </button>
        ) : (
          <p className="text-xs text-gray-400">Solo un administrador puede cambiar el mapeo.</p>
        )}
        {saved && <span className="text-xs text-emerald-600">Guardado</span>}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </form>
  );
}
