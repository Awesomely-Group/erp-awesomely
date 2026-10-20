"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { SearchableSelect, type SearchableSelectOption } from "@/components/searchable-select";
import { LocalDateTime } from "@/components/local-datetime";
import { leadStatusLabel } from "@/lib/crm-relations";
import type { CrmLeadStatus } from "@prisma/client";
import { linkLeadToAdCampaign } from "../actions";

export interface AttributedLead {
  id: string;
  name: string;
  status: CrmLeadStatus;
  createdAt: string;
  formId: string | null;
  utmCampaign: string | null;
  qualified: boolean;
}

/**
 * Leads del CRM atribuidos a la campaña, y el botón para vincular uno más a mano. Hasta que
 * la web mande la atribución al webhook de leads, esta es la forma de que el CPL se calcule
 * sobre leads reales.
 */
export function AttributedLeads({
  campaignId,
  leads,
  candidates,
}: {
  campaignId: string;
  leads: AttributedLead[];
  candidates: SearchableSelectOption[];
}): React.JSX.Element {
  const [isPending, startTransition] = useTransition();
  const [showLink, setShowLink] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleLink(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const leadId = String(new FormData(e.currentTarget).get("leadId") ?? "");
    if (!leadId) return;
    setError(null);
    startTransition(async () => {
      try {
        await linkLeadToAdCampaign(leadId, campaignId);
        setShowLink(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo vincular");
      }
    });
  }

  function handleUnlink(leadId: string): void {
    setError(null);
    startTransition(async () => {
      try {
        await linkLeadToAdCampaign(leadId, null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo desvincular");
      }
    });
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-900">Leads atribuidos ({leads.length})</h2>
        <button type="button" onClick={() => setShowLink((v) => !v)} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">
          {showLink ? "Cancelar" : "+ Vincular lead"}
        </button>
      </div>

      {showLink && (
        <form onSubmit={handleLink} className="flex flex-wrap items-end gap-2 border-t border-gray-100 bg-gray-50 px-4 py-3">
          <div className="min-w-[18rem] flex-1">
            <SearchableSelect
              name="leadId"
              options={candidates}
              placeholder="Buscar lead sin campaña…"
              emptyMessage="Ningún lead sin campaña de esta marca en los últimos 6 meses"
            />
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {isPending ? "Vinculando…" : "Vincular"}
          </button>
        </form>
      )}
      {error && <p className="px-4 pb-2 text-xs text-red-600">{error}</p>}

      {leads.length === 0 ? (
        <p className="border-t border-gray-100 px-4 py-6 text-center text-sm text-gray-400">
          Ningún lead atribuido todavía. Llegarán solos cuando la web envíe gclid/UTM al webhook de leads; mientras, vincúlalos aquí.
        </p>
      ) : (
        <table className="w-full border-t border-gray-100 text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2 font-medium">Lead</th>
              <th className="px-4 py-2 font-medium">Entrada</th>
              <th className="px-4 py-2 font-medium">Formulario</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {leads.map((l) => (
              <tr key={l.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <Link href={`/crm/leads/${l.id}`} className="font-medium text-indigo-600 hover:text-indigo-800">
                    {l.name}
                  </Link>
                  {l.utmCampaign && <span className="ml-2 text-xs text-gray-400">utm: {l.utmCampaign}</span>}
                </td>
                <td className="px-4 py-2.5 text-gray-600">
                  <LocalDateTime date={l.createdAt} dateOnly />
                </td>
                <td className="px-4 py-2.5 text-gray-600">{l.formId ?? "—"}</td>
                <td className="px-4 py-2.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      l.qualified ? "bg-emerald-100 text-emerald-700" : l.status === "DISQUALIFIED" ? "bg-gray-100 text-gray-500" : "bg-sky-100 text-sky-700"
                    }`}
                  >
                    {l.qualified ? "Cualificado" : leadStatusLabel(l.status)}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button
                    type="button"
                    onClick={() => handleUnlink(l.id)}
                    disabled={isPending}
                    className="text-xs text-gray-400 hover:text-red-600 disabled:opacity-50"
                  >
                    Quitar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
