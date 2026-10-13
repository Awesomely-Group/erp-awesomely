"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  moveDealStage,
  assignDealOwner,
  createActivity,
  completeActivity,
  updateDealType,
  setDealContactRole,
  removeDealContact,
} from "../../actions";
import type {
  CrmActivityType,
  CrmDealType,
  CrmDecisionRole,
  CrmOrigin,
} from "@prisma/client";
import { DEAL_TYPE_OPTIONS, DECISION_ROLE_OPTIONS, originLabel } from "@/lib/crm-relations";

/** Persona que participa en la decisión — puede ser de otra cuenta (asesor externo). */
export interface DealDecisionContact {
  contactId: string;
  name: string;
  accountName: string;
  role: CrmDecisionRole;
}

export interface DealDetail {
  id: string;
  name: string;
  marca: string;
  lineOfBusiness: string;
  contactName: string | null;
  amount: number | null;
  notes: string | null;
  origin: CrmOrigin | null;
  market: string | null;
  seats: number | null;
  dealType: CrmDealType;
  probability: number | null;
  expectedCloseDate: string | null;
  decisionContacts: DealDecisionContact[];
  stageId: string;
  stageName: string;
  ownerId: string | null;
  ownerLabel: string | null;
  accountId: string;
  accountName: string;
  /** De qué lead nació. Null cuando el negocio viene de un cliente que ya estaba dentro. */
  sourceLead: { id: string; name: string; source: string } | null;
  createdAt: string;
  /** Las otras oportunidades de la misma cuenta, abiertas o cerradas. */
  siblingDeals: { id: string; name: string; amount: number | null; stageName: string; closed: boolean }[];
  activities: {
    id: string;
    type: string;
    title: string;
    notes: string | null;
    dueDate: string | null;
    completedAt: string | null;
  }[];
  budgets: { id: string; name: string; amount: number; status: string; documensoStatus: string | null }[];
  commissions: { id: string; type: string; amount: number; status: string }[];
}

const ACTIVITY_TYPES: { value: CrmActivityType; label: string }[] = [
  { value: "NOTE", label: "Nota" },
  { value: "CALL", label: "Llamada" },
  { value: "MEETING", label: "Reunión" },
  { value: "TASK", label: "Tarea" },
];

export function DealDetailView({
  deal,
  stages,
  users,
  contacts,
}: {
  deal: DealDetail;
  stages: { id: string; name: string; order: number }[];
  users: { id: string; label: string }[];
  contacts: { id: string; label: string }[];
}): React.JSX.Element {
  const [isPending, startTransition] = useTransition();
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [activityType, setActivityType] = useState<CrmActivityType>("NOTE");
  const [activityTitle, setActivityTitle] = useState("");
  const [activityNotes, setActivityNotes] = useState("");

  function handleStageChange(stageId: string): void {
    startTransition(async () => {
      await moveDealStage(deal.id, stageId);
    });
  }

  function handleOwnerChange(ownerId: string): void {
    startTransition(async () => {
      await assignDealOwner(deal.id, ownerId || null);
    });
  }

  function handleDealTypeChange(dealType: CrmDealType): void {
    startTransition(async () => {
      await updateDealType(deal.id, dealType);
    });
  }

  function handleContactRole(contactId: string, role: CrmDecisionRole): void {
    startTransition(async () => {
      await setDealContactRole(deal.id, contactId, role);
    });
  }

  function handleAddActivity(e: React.FormEvent): void {
    e.preventDefault();
    if (!activityTitle.trim()) return;
    startTransition(async () => {
      await createActivity({
        dealId: deal.id,
        type: activityType,
        title: activityTitle,
        notes: activityNotes || null,
      });
      setActivityTitle("");
      setActivityNotes("");
      setShowActivityForm(false);
    });
  }

  function handleCompleteActivity(activityId: string): void {
    startTransition(async () => {
      await completeActivity(activityId);
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/crm" className="text-xs text-gray-400 hover:text-gray-600">
          ← Volver al pipeline
        </Link>
        <div className="mt-1 flex items-baseline gap-2">
          <h1 className="text-2xl font-semibold text-gray-900">{deal.name}</h1>
          <Link
            href={`/crm/cuentas/${deal.accountId}`}
            className="text-sm text-gray-500 hover:text-indigo-600"
          >
            {deal.accountName}
          </Link>
        </div>
        <p className="text-sm text-gray-500">
          {deal.marca}
          {deal.lineOfBusiness !== "GENERAL" && ` · ${deal.lineOfBusiness}`} · creada el{" "}
          {formatDate(deal.createdAt)}
          {deal.sourceLead && (
            <>
              {" · nació del lead "}
              <Link
                href={`/crm/leads/${deal.sourceLead.id}`}
                className="text-indigo-600 hover:text-indigo-800"
              >
                {deal.sourceLead.name}
              </Link>
              {` (${deal.sourceLead.source})`}
            </>
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="space-y-4 md:col-span-2">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-900">La operación</h2>
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Importe</dt>
                <dd className="text-gray-900">
                  {deal.amount !== null ? formatCurrency(deal.amount) : "—"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Probabilidad</dt>
                <dd className="text-gray-900">
                  {deal.probability !== null ? `${deal.probability}%` : "—"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Cierre previsto</dt>
                <dd className="text-gray-900">
                  {deal.expectedCloseDate ? formatDate(deal.expectedCloseDate) : "—"}
                </dd>
              </div>
              {deal.origin && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Origen</dt>
                  <dd className="text-gray-900">{originLabel(deal.origin)}</dd>
                </div>
              )}
              {deal.market && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Mercado</dt>
                  <dd className="text-gray-900">{deal.market}</dd>
                </div>
              )}
              {deal.seats !== null && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Usuarios/seats propuestos</dt>
                  <dd className="text-gray-900">{deal.seats}</dd>
                </div>
              )}
              {deal.notes && (
                <div className="pt-2">
                  <dt className="text-gray-500">Notas</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-gray-900">{deal.notes}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-900">Personas en la decisión</h2>
            <p className="mt-0.5 text-xs text-gray-400">
              Pueden ser de otra cuenta: los asesores externos deciden sin trabajar en la
              empresa cliente.
            </p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {deal.decisionContacts.map((c) => (
                <li key={c.contactId} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-gray-900">
                    {c.name} <span className="text-gray-400">· {c.accountName}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <select
                      value={c.role}
                      disabled={isPending}
                      onChange={(e) => handleContactRole(c.contactId, e.target.value as CrmDecisionRole)}
                      className="rounded-md border border-gray-300 px-1.5 py-1 text-xs text-gray-900"
                    >
                      {DECISION_ROLE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() =>
                        startTransition(async () => {
                          await removeDealContact(deal.id, c.contactId);
                        })
                      }
                      disabled={isPending}
                      title="Quitar de la decisión"
                      className="text-gray-300 hover:text-gray-600"
                    >
                      ×
                    </button>
                  </span>
                </li>
              ))}
              {deal.decisionContacts.length === 0 && (
                <li className="text-xs text-gray-400">Nadie asignado todavía.</li>
              )}
            </ul>
            <select
              value=""
              disabled={isPending}
              onChange={(e) => e.target.value && handleContactRole(e.target.value, "USUARIO")}
              className="mt-2 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
            >
              <option value="">+ Añadir persona…</option>
              {contacts
                .filter((c) => !deal.decisionContacts.some((d) => d.contactId === c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
            </select>
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
              {deal.activities.length === 0 && (
                <li className="text-xs text-gray-400">Sin actividades todavía.</li>
              )}
              {deal.activities.map((a) => (
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
                      <p className="text-xs text-emerald-600">Completada el {formatDate(a.completedAt)}</p>
                    )}
                  </div>
                  {!a.completedAt && (
                    <button
                      onClick={() => handleCompleteActivity(a.id)}
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

          {deal.budgets.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-gray-900">Propuestas</h2>
              <ul className="mt-2 space-y-1 text-sm">
                {deal.budgets.map((b) => (
                  <li key={b.id} className="flex justify-between">
                    <Link href={`/budgets/${b.id}`} className="text-indigo-600 hover:text-indigo-800">
                      {b.name}
                    </Link>
                    <span className="text-gray-500">
                      {formatCurrency(b.amount)} · {b.documensoStatus ?? b.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {deal.commissions.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-gray-900">Comisiones generadas</h2>
              <ul className="mt-2 space-y-1 text-sm">
                {deal.commissions.map((c) => (
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
            <h2 className="text-sm font-semibold text-gray-900">Etapa</h2>
            <select
              value={deal.stageId}
              onChange={(e) => handleStageChange(e.target.value)}
              className="mt-2 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            >
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-900">Tipo de operación</h2>
            <select
              value={deal.dealType}
              disabled={isPending}
              onChange={(e) => handleDealTypeChange(e.target.value as CrmDealType)}
              className="mt-2 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            >
              {DEAL_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-400">
              Las ampliaciones de un retainer no son ventas nuevas: marcarlas evita inflar
              las conversiones y los objetivos de captación.
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-900">Responsable</h2>
            <select
              value={deal.ownerId ?? ""}
              onChange={(e) => handleOwnerChange(e.target.value)}
              className="mt-2 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="">Sin asignar</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-900">Cuenta</h2>
            <Link
              href={`/crm/cuentas/${deal.accountId}`}
              className="mt-2 block text-sm text-indigo-600 hover:text-indigo-800"
            >
              {deal.accountName}
            </Link>

            {/* Con varios frentes vivos del mismo cliente, trabajar uno sin ver los otros
                lleva a llamarle dos veces el mismo día por dos cosas distintas. */}
            {deal.siblingDeals.length > 0 && (
              <>
                <p className="mt-3 text-xs font-medium text-gray-500">
                  Otras oportunidades de esta cuenta
                </p>
                <ul className="mt-1 space-y-1 text-sm">
                  {deal.siblingDeals.map((d) => (
                    <li key={d.id} className="flex items-baseline justify-between gap-2">
                      <Link
                        href={`/crm/deals/${d.id}`}
                        className={
                          d.closed
                            ? "min-w-0 truncate text-gray-400 hover:text-gray-600"
                            : "min-w-0 truncate text-gray-900 hover:text-indigo-700"
                        }
                      >
                        {d.name}
                      </Link>
                      <span className="shrink-0 text-xs text-gray-400">
                        {d.stageName}
                        {d.amount !== null && ` · ${formatCurrency(d.amount)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
