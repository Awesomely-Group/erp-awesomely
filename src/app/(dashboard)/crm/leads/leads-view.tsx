"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { MARCA_OPTIONS } from "@/lib/org";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { ORIGIN_OPTIONS, leadStatusLabel } from "@/lib/crm-relations";
import { createLeadManual, markLeadContacted } from "../actions";
import type { CrmLeadStatus, CrmOrigin } from "@prisma/client";

export interface LeadRow {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  status: CrmLeadStatus;
  source: string;
  estimatedAmount: number | null;
  ownerName: string | null;
  accountName: string | null;
  createdAt: string;
  /** Cuántas oportunidades salieron de este lead. */
  dealCount: number;
}

export interface LeadsUser {
  id: string;
  label: string;
}

const STATUS_STYLE: Record<CrmLeadStatus, string> = {
  NEW: "bg-indigo-50 text-indigo-700",
  CONTACTED: "bg-sky-50 text-sky-700",
  QUALIFIED: "bg-emerald-50 text-emerald-700",
  DISQUALIFIED: "bg-gray-100 text-gray-500",
};

const FILTERS: { value: string; label: string }[] = [
  { value: "abiertos", label: "Por atender" },
  { value: "QUALIFIED", label: "Cualificados" },
  { value: "DISQUALIFIED", label: "Descartados" },
  { value: "todos", label: "Todos" },
];

function NewLeadModal({
  marca,
  users,
  onClose,
}: {
  marca: string;
  users: LeadsUser[];
  onClose: () => void;
}): React.JSX.Element {
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [estimatedAmount, setEstimatedAmount] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [notes, setNotes] = useState("");
  const [origin, setOrigin] = useState<CrmOrigin | "">("");
  const [market, setMarket] = useState("");
  const [seats, setSeats] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (!name.trim()) {
      setError("El nombre es obligatorio");
      return;
    }
    if (!email.trim() && !phone.trim()) {
      setError("Necesitas al menos un email o un teléfono de contacto");
      return;
    }
    startTransition(async () => {
      await createLeadManual({
        name,
        marca,
        contactName: contactName || null,
        email: email || null,
        phone: phone || null,
        estimatedAmount: estimatedAmount ? Number(estimatedAmount) : null,
        ownerId: ownerId || null,
        notes: notes || null,
        origin: origin || null,
        market: market || null,
        seats: seats ? Number(seats) : null,
      });
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <h2 className="text-base font-semibold text-gray-900">Nuevo lead — {marca}</h2>
        <p className="mt-1 text-xs text-gray-400">
          Una entrada sin cualificar. Cuando sepas que hay negocio, se convierte en
          oportunidad desde su ficha.
        </p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <input
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            placeholder="Nombre del lead / empresa *"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            placeholder="Persona de contacto"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
              placeholder="Teléfono"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <input
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            placeholder="Presupuesto que declara (€, orientativo)"
            type="number"
            value={estimatedAmount}
            onChange={(e) => setEstimatedAmount(e.target.value)}
          />
          <select
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
          >
            <option value="">Sin asignar</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <select
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
              value={origin}
              onChange={(e) => setOrigin(e.target.value as CrmOrigin | "")}
            >
              <option value="">Origen (opcional)</option>
              {ORIGIN_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <input
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
              placeholder="Mercado (UK/US/ES…)"
              value={market}
              onChange={(e) => setMarket(e.target.value)}
            />
          </div>
          <input
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            placeholder="Usuarios/seats que pide (opcional)"
            type="number"
            value={seats}
            onChange={(e) => setSeats(e.target.value)}
          />
          <textarea
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            placeholder="Notas"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
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
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {isPending ? "Creando…" : "Crear lead"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function LeadsView({
  marca,
  filtro,
  leads,
  users,
}: {
  marca: string;
  filtro: string;
  leads: LeadRow[];
  users: LeadsUser[];
}): React.JSX.Element {
  const [isPending, startTransition] = useTransition();
  const [showNewLead, setShowNewLead] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">CRM — Leads</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Entradas sin cualificar. Cualificar un lead es crearle su primera oportunidad
            — el embudo está en{" "}
            <Link href="/crm" className="text-indigo-600 hover:text-indigo-800">
              el pipeline
            </Link>
            .
          </p>
          <div className="mt-2 flex gap-1">
            {MARCA_OPTIONS.map((m) => (
              <Link
                key={m.value}
                href={`/crm/leads?marca=${encodeURIComponent(m.value)}&estado=${filtro}`}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium",
                  m.value === marca
                    ? "bg-indigo-100 text-indigo-700"
                    : "text-gray-500 hover:bg-gray-100"
                )}
              >
                {m.label}
              </Link>
            ))}
          </div>
          <div className="mt-1.5 flex gap-1">
            {FILTERS.map((f) => (
              <Link
                key={f.value}
                href={`/crm/leads?marca=${encodeURIComponent(marca)}&estado=${f.value}`}
                className={cn(
                  "rounded-md px-2 py-0.5 text-[11px] font-medium",
                  f.value === filtro
                    ? "bg-gray-800 text-white"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                )}
              >
                {f.label}
              </Link>
            ))}
          </div>
        </div>
        <button
          onClick={() => setShowNewLead(true)}
          className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          Nuevo lead
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Lead</th>
              <th className="px-4 py-2 text-left font-medium">Contacto</th>
              <th className="px-4 py-2 text-left font-medium">Estado</th>
              <th className="px-4 py-2 text-left font-medium">Responsable</th>
              <th className="px-4 py-2 text-right font-medium">Declara</th>
              <th className="px-4 py-2 text-right font-medium">Entró</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {leads.map((l) => (
              <tr key={l.id} className="hover:bg-gray-50">
                <td className="px-4 py-2">
                  <Link
                    href={`/crm/leads/${l.id}`}
                    className="font-medium text-gray-900 hover:text-indigo-700"
                  >
                    {l.name}
                  </Link>
                  <p className="text-xs text-gray-400">
                    {l.source}
                    {l.accountName && ` · ${l.accountName}`}
                    {l.dealCount > 0 &&
                      ` · ${l.dealCount} oportunidad${l.dealCount === 1 ? "" : "es"}`}
                  </p>
                </td>
                <td className="px-4 py-2 text-gray-600">
                  {l.contactName ?? "—"}
                  <p className="text-xs text-gray-400">{l.email ?? l.phone ?? ""}</p>
                </td>
                <td className="px-4 py-2">
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-xs font-medium",
                      STATUS_STYLE[l.status]
                    )}
                  >
                    {leadStatusLabel(l.status)}
                  </span>
                </td>
                <td className="px-4 py-2 text-gray-600">{l.ownerName ?? "Sin asignar"}</td>
                <td className="px-4 py-2 text-right text-gray-600">
                  {l.estimatedAmount !== null ? formatCurrency(l.estimatedAmount) : "—"}
                </td>
                <td className="px-4 py-2 text-right text-xs text-gray-400">
                  {formatDate(l.createdAt)}
                </td>
                <td className="px-4 py-2 text-right">
                  {l.status === "NEW" && (
                    <button
                      onClick={() =>
                        startTransition(async () => {
                          await markLeadContacted(l.id);
                        })
                      }
                      disabled={isPending}
                      className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                    >
                      Marcar contactado
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {leads.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">
                  No hay leads con este filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showNewLead && (
        <NewLeadModal marca={marca} users={users} onClose={() => setShowNewLead(false)} />
      )}
    </div>
  );
}
