"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { MARCA_OPTIONS } from "@/lib/org";
import { createAccount } from "../actions";

interface AccountRow {
  id: string;
  name: string;
  marca: string | null;
  lifecycle: string;
  ownerLabel: string | null;
  leadsCount: number;
  contactsCount: number;
  hasHoldedContact: boolean;
}

const LIFECYCLE_LABEL: Record<string, string> = {
  LEAD: "Lead",
  QUALIFIED: "Cualificada",
  CUSTOMER: "Cliente",
  CHURNED: "Perdida",
  DISQUALIFIED: "Descartada",
};

export function AccountsView({ accounts }: { accounts: AccountRow[] }): React.JSX.Element {
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [marca, setMarca] = useState("");

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (!name.trim()) return;
    startTransition(async () => {
      await createAccount({ name, marca: marca || null });
      setName("");
      setMarca("");
      setShowForm(false);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Cuentas</h1>
          <p className="text-sm text-gray-500">Ficha 360 de clientes y prospectos</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          Nueva cuenta
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="flex items-end gap-2 rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex-1">
            <label className="text-xs text-gray-500">Nombre</label>
            <input
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">Marca</label>
            <select
              className="mt-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
              value={marca}
              onChange={(e) => setMarca(e.target.value)}
            >
              <option value="">—</option>
              {MARCA_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Crear
          </button>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">Nombre</th>
              <th className="px-4 py-2">Marca</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2">Responsable</th>
              <th className="px-4 py-2">Leads</th>
              <th className="px-4 py-2">Contactos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {accounts.map((a) => (
              <tr key={a.id} className="hover:bg-gray-50">
                <td className="px-4 py-2">
                  <Link href={`/crm/cuentas/${a.id}`} className="font-medium text-indigo-600 hover:text-indigo-800">
                    {a.name}
                  </Link>
                  {a.hasHoldedContact && (
                    <span className="ml-2 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-600">
                      Holded
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-gray-500">{a.marca ?? "—"}</td>
                <td className="px-4 py-2 text-gray-500">{LIFECYCLE_LABEL[a.lifecycle] ?? a.lifecycle}</td>
                <td className="px-4 py-2 text-gray-500">{a.ownerLabel ?? "—"}</td>
                <td className="px-4 py-2 text-gray-500">{a.leadsCount}</td>
                <td className="px-4 py-2 text-gray-500">{a.contactsCount}</td>
              </tr>
            ))}
            {accounts.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-400">
                  Sin cuentas todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
