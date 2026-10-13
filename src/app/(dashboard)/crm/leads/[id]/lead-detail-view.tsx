"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import {
  assignLeadOwner,
  completeActivity,
  convertLeadToDeal,
  createActivity,
  disqualifyLead,
  linkLeadToAccount,
  markLeadContacted,
  reactivateLead,
} from "../../actions";
import type { CrmActivityType, CrmDealType, CrmLeadStatus, CrmOrigin } from "@prisma/client";
import { DEAL_TYPE_OPTIONS, leadStatusLabel, originLabel } from "@/lib/crm-relations";

export interface LeadDetail {
  id: string;
  name: string;
  marca: string;
  lineOfBusiness: string;
  source: string;
  status: CrmLeadStatus;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  estimatedAmount: number | null;
  notes: string | null;
  disqualifiedReason: string | null;
  origin: CrmOrigin | null;
  market: string | null;
  seats: number | null;
  campaignSource: string | null;
  utmSource: string | null;
  utmCampaign: string | null;
  ownerId: string | null;
  accountId: string | null;
  accountName: string | null;
  createdAt: string;
  convertedAt: string | null;
  /** Las oportunidades que salieron de este lead. */
  deals: { id: string; name: string; amount: number | null; stageName: string }[];
  activities: {
    id: string;
    type: string;
    title: string;
    notes: string | null;
    dueDate: string | null;
    completedAt: string | null;
  }[];
  commissions: { id: string; type: string; amount: number; status: string }[];
}

const ACTIVITY_TYPES: { value: CrmActivityType; label: string }[] = [
  { value: "NOTE", label: "Nota" },
  { value: "CALL", label: "Llamada" },
  { value: "MEETING", label: "Reunión" },
  { value: "TASK", label: "Tarea" },
];

const STATUS_STYLE: Record<CrmLeadStatus, string> = {
  NEW: "bg-indigo-50 text-indigo-700",
  CONTACTED: "bg-sky-50 text-sky-700",
  QUALIFIED: "bg-emerald-50 text-emerald-700",
  DISQUALIFIED: "bg-gray-100 text-gray-500",
};

/**
 * Cualificar = crear la primera oportunidad. El formulario pide solo lo que hace falta
 * para abrirla; el resto se afina ya en la ficha del deal.
 */
function ConvertModal({
  lead,
  accounts,
  onClose,
}: {
  lead: LeadDetail;
  accounts: { id: string; name: string }[];
  onClose: () => void;
}): React.JSX.Element {
  const [isPending, startTransition] = useTransition();
  const [dealName, setDealName] = useState(lead.name);
  const [accountId, setAccountId] = useState(lead.accountId ?? "");
  const [amount, setAmount] = useState(
    lead.estimatedAmount !== null ? String(lead.estimatedAmount) : ""
  );
  const [dealType, setDealType] = useState<CrmDealType>("NEW_BUSINESS");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (!dealName.trim()) {
      setError("Ponle nombre a la oportunidad");
      return;
    }
    startTransition(async () => {
      try {
        await convertLeadToDeal({
          leadId: lead.id,
          accountId: accountId || null,
          dealName,
          amount: amount ? Number(amount) : null,
          dealType,
          expectedCloseDate: expectedCloseDate || null,
        });
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cualificar el lead");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <h2 className="text-base font-semibold text-gray-900">Cualificar — {lead.name}</h2>
        <p className="mt-1 text-xs text-gray-400">
          Se crea la oportunidad en la primera etapa del embudo de {lead.marca}
          {lead.lineOfBusiness !== "GENERAL" && ` · ${lead.lineOfBusiness}`}. El lead se
          conserva: es el registro de por dónde entró.
        </p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <input
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            placeholder="Qué se vende *"
            value={dealName}
            onChange={(e) => setDealName(e.target.value)}
          />
          <select
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            <option value="">— Crear cuenta nueva «{lead.name}» —</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
              placeholder="Importe (€)"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <select
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
              value={dealType}
              onChange={(e) => setDealType(e.target.value as CrmDealType)}
            >
              {DEAL_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <input
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600"
            title="Cierre previsto"
            type="date"
            value={expectedCloseDate}
            onChange={(e) => setExpectedCloseDate(e.target.value)}
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {isPending ? "Creando…" : "Crear oportunidad"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function LeadDetailView({
  lead,
  users,
  accounts,
}: {
  lead: LeadDetail;
  users: { id: string; label: string }[];
  accounts: { id: string; name: string }[];
}): React.JSX.Element {
  const [isPending, startTransition] = useTransition();
  const [showConvert, setShowConvert] = useState(false);
  const [showDisqualify, setShowDisqualify] = useState(false);
  const [reason, setReason] = useState("");
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [activityType, setActivityType] = useState<CrmActivityType>("NOTE");
  const [activityTitle, setActivityTitle] = useState("");
  const [activityNotes, setActivityNotes] = useState("");

  function handleAddActivity(e: React.FormEvent): void {
    e.preventDefault();
    if (!activityTitle.trim()) return;
    startTransition(async () => {
      await createActivity({
        leadId: lead.id,
        type: activityType,
        title: activityTitle,
        notes: activityNotes || null,
      });
      setActivityTitle("");
      setActivityNotes("");
      setShowActivityForm(false);
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/crm/leads" className="text-xs text-gray-400 hover:text-gray-600">
          ← Volver a leads
        </Link>
        <div className="mt-1 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-gray-900">{lead.name}</h1>
          <span
            className={cn("rounded px-2 py-0.5 text-xs font-medium", STATUS_STYLE[lead.status])}
          >
            {leadStatusLabel(lead.status)}
          </span>
        </div>
        <p className="text-sm text-gray-500">
          {lead.marca}
          {lead.lineOfBusiness !== "GENERAL" && ` · ${lead.lineOfBusiness}`} · {lead.source} ·
          entró el {formatDate(lead.createdAt)}
          {lead.convertedAt && ` · cualificado el ${formatDate(lead.convertedAt)}`}
        </p>
      </div>

      {/* Las dos únicas decisiones que caben sobre un lead: vale o no vale. */}
      <div className="flex flex-wrap items-center gap-2">
        {lead.status === "NEW" && (
          <button
            onClick={() =>
              startTransition(async () => {
                await markLeadContacted(lead.id);
              })
            }
            disabled={isPending}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Marcar contactado
          </button>
        )}
        {lead.status !== "DISQUALIFIED" && (
          <button
            onClick={() => setShowConvert(true)}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
          >
            {lead.status === "QUALIFIED" ? "Abrir otra oportunidad" : "Cualificar"}
          </button>
        )}
        {lead.status === "DISQUALIFIED" ? (
          <button
            onClick={() =>
              startTransition(async () => {
                await reactivateLead(lead.id);
              })
            }
            disabled={isPending}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Reactivar
          </button>
        ) : (
          <button
            onClick={() => setShowDisqualify((v) => !v)}
            className="rounded-md px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100"
          >
            Descartar
          </button>
        )}
      </div>

      {showDisqualify && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!reason.trim()) return;
            startTransition(async () => {
              await disqualifyLead(lead.id, reason);
              setShowDisqualify(false);
              setReason("");
            });
          }}
          className="flex gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3"
        >
          <input
            className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            placeholder="¿Por qué se descarta? (sin presupuesto, fuera de mercado, no contesta…)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <button
            type="submit"
            disabled={isPending || !reason.trim()}
            className="rounded-md bg-gray-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-900 disabled:opacity-50"
          >
            Descartar
          </button>
        </form>
      )}

      {lead.disqualifiedReason && (
        <p className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
          <span className="font-medium text-gray-900">Descartado:</span> {lead.disqualifiedReason}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="space-y-4 md:col-span-2">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-900">Contacto</h2>
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Persona</dt>
                <dd className="text-gray-900">{lead.contactName ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Email</dt>
                <dd className="text-gray-900">{lead.email ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Teléfono</dt>
                <dd className="text-gray-900">{lead.phone ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Presupuesto que declara</dt>
                <dd className="text-gray-900">
                  {lead.estimatedAmount !== null ? formatCurrency(lead.estimatedAmount) : "—"}
                </dd>
              </div>
              {lead.origin && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Origen</dt>
                  <dd className="text-gray-900">{originLabel(lead.origin)}</dd>
                </div>
              )}
              {lead.market && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Mercado</dt>
                  <dd className="text-gray-900">{lead.market}</dd>
                </div>
              )}
              {lead.seats !== null && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Usuarios/seats que pide</dt>
                  <dd className="text-gray-900">{lead.seats}</dd>
                </div>
              )}
              {(lead.campaignSource ?? lead.utmSource ?? lead.utmCampaign) && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Campaña</dt>
                  <dd className="text-gray-900">
                    {[lead.campaignSource, lead.utmSource, lead.utmCampaign]
                      .filter(Boolean)
                      .join(" · ")}
                  </dd>
                </div>
              )}
              {lead.notes && (
                <div className="pt-2">
                  <dt className="text-gray-500">Notas</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-gray-900">{lead.notes}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Actividades</h2>
              <button
                onClick={() => setShowActivityForm((v) => !v)}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
              >
                + Añadir
              </button>
            </div>

            {showActivityForm && (
              <form onSubmit={handleAddActivity} className="mt-3 space-y-2 rounded-md bg-gray-50 p-3">
                <div className="flex gap-2">
                  <select
                    value={activityType}
                    onChange={(e) => setActivityType(e.target.value as CrmActivityType)}
                    className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                  >
                    {ACTIVITY_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <input
                    className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm"
                    placeholder="Título"
                    value={activityTitle}
                    onChange={(e) => setActivityTitle(e.target.value)}
                  />
                </div>
                <textarea
                  className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                  placeholder="Notas (opcional)"
                  rows={2}
                  value={activityNotes}
                  onChange={(e) => setActivityNotes(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowActivityForm(false)}
                    className="text-xs text-gray-500"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isPending}
                    className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-700"
                  >
                    Guardar
                  </button>
                </div>
              </form>
            )}

            <ul className="mt-3 space-y-2">
              {lead.activities.length === 0 && (
                <li className="text-xs text-gray-400">Sin actividades todavía.</li>
              )}
              {lead.activities.map((a) => (
                <li
                  key={a.id}
                  className="flex items-start justify-between gap-2 rounded-md border border-gray-100 p-2 text-sm"
                >
                  <div>
                    <p className="font-medium text-gray-900">
                      [{ACTIVITY_TYPES.find((t) => t.value === a.type)?.label ?? a.type}] {a.title}
                    </p>
                    {a.notes && <p className="text-xs text-gray-500">{a.notes}</p>}
                    {a.completedAt && (
                      <p className="text-xs text-emerald-600">
                        Completada el {formatDate(a.completedAt)}
                      </p>
                    )}
                  </div>
                  {!a.completedAt && (
                    <button
                      onClick={() =>
                        startTransition(async () => {
                          await completeActivity(a.id);
                        })
                      }
                      disabled={isPending}
                      className="shrink-0 text-xs font-medium text-indigo-600 hover:text-indigo-800"
                    >
                      Completar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {lead.commissions.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-gray-900">Comisiones generadas</h2>
              <ul className="mt-2 space-y-1 text-sm">
                {lead.commissions.map((c) => (
                  <li key={c.id} className="flex justify-between">
                    <span className="text-gray-700">
                      {c.type === "PROPOSAL_PERCENT" ? "% propuesta" : "Reunión cualificada"}
                    </span>
                    <span className="text-gray-500">
                      {formatCurrency(c.amount)} · {c.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-900">Oportunidades</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {lead.deals.map((d) => (
                <li key={d.id} className="flex items-baseline justify-between gap-2">
                  <Link
                    href={`/crm/deals/${d.id}`}
                    className="min-w-0 truncate text-indigo-600 hover:text-indigo-800"
                  >
                    {d.name}
                  </Link>
                  <span className="shrink-0 text-xs text-gray-400">
                    {d.stageName}
                    {d.amount !== null && ` · ${formatCurrency(d.amount)}`}
                  </span>
                </li>
              ))}
              {lead.deals.length === 0 && (
                <li className="text-xs text-gray-400">
                  Todavía ninguna. Cualificar el lead es crear la primera.
                </li>
              )}
            </ul>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-900">Responsable</h2>
            <select
              value={lead.ownerId ?? ""}
              disabled={isPending}
              onChange={(e) =>
                startTransition(async () => {
                  await assignLeadOwner(lead.id, e.target.value || null);
                })
              }
              className="mt-2 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="">Sin asignar</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-400">
              Sin responsable no hay a quién pagarle la comisión por reunión cualificada.
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-900">Cuenta</h2>
            <select
              value={lead.accountId ?? ""}
              disabled={isPending}
              onChange={(e) =>
                startTransition(async () => {
                  await linkLeadToAccount(lead.id, e.target.value || null);
                })
              }
              className="mt-2 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="">— Sin cuenta todavía —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-400">
              Opcional: si no la enlazas, al cualificar se crea una con el nombre del lead.
            </p>
          </div>
        </div>
      </div>

      {showConvert && (
        <ConvertModal lead={lead} accounts={accounts} onClose={() => setShowConvert(false)} />
      )}
    </div>
  );
}
