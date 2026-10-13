"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Plus, X } from "lucide-react";
import type { CrmAccountType, CrmRelationType } from "@prisma/client";
import { RELATION_TYPE_OPTIONS } from "@/lib/crm-relations";
import {
  addAccountRelation,
  removeAccountRelation,
  updateAccountClassification,
} from "../../actions";

interface AccountOption {
  id: string;
  name: string;
}

/** Una relación ya normalizada por el servidor: la etiqueta viene leída desde ESTA cuenta. */
export interface RelationRow {
  id: string;
  label: string;
  otherId: string;
  otherName: string;
  note: string | null;
}

export function AccountClassificationCard({
  accountId,
  type,
  referredBy,
  partners,
}: {
  accountId: string;
  type: CrmAccountType;
  referredBy: AccountOption | null;
  partners: AccountOption[];
}): React.JSX.Element {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-900">Clasificación</h2>

      <label className="mt-3 block text-xs text-gray-500">
        Tipo de cuenta
        <select
          value={type}
          disabled={isPending}
          onChange={(e) =>
            startTransition(async () => {
              await updateAccountClassification({
                accountId,
                type: e.target.value as CrmAccountType,
              });
            })
          }
          className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
        >
          <option value="CLIENT">Cliente o prospecto</option>
          <option value="PARTNER">Partner / prescriptor</option>
        </select>
      </label>

      <label className="mt-3 block text-xs text-gray-500">
        Nos la trajo
        <select
          value={referredBy?.id ?? ""}
          disabled={isPending}
          onChange={(e) =>
            startTransition(async () => {
              await updateAccountClassification({
                accountId,
                referredByAccountId: e.target.value || null,
              });
            })
          }
          className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
        >
          <option value="">— Nadie / directo —</option>
          {partners
            .filter((p) => p.id !== accountId)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
      </label>
      <p className="mt-1 text-xs text-gray-400">
        Solo se listan las cuentas marcadas como partner. Sin esto no se puede medir cuánto
        negocio aporta cada prescriptor.
      </p>
    </div>
  );
}

export function AccountRelationsCard({
  accountId,
  relations,
  accounts,
}: {
  accountId: string;
  relations: RelationRow[];
  accounts: AccountOption[];
}): React.JSX.Element {
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [toAccountId, setToAccountId] = useState("");
  const [type, setType] = useState<CrmRelationType>("SIBLING_OF");

  function handleAdd(e: React.FormEvent): void {
    e.preventDefault();
    if (!toAccountId) return;
    startTransition(async () => {
      await addAccountRelation({ fromAccountId: accountId, toAccountId, type });
      setToAccountId("");
      setShowForm(false);
    });
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Grupo y relaciones</h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
        >
          <Plus className="h-3.5 w-3.5" />
          Añadir
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="mt-3 space-y-2 rounded-md bg-gray-50 p-3">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as CrmRelationType)}
            className="block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
          >
            {RELATION_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                Esta cuenta {o.label}…
              </option>
            ))}
          </select>
          <select
            value={toAccountId}
            onChange={(e) => setToAccountId(e.target.value)}
            className="block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
          >
            <option value="">— Elige la otra cuenta —</option>
            {accounts
              .filter((a) => a.id !== accountId)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
          <button
            type="submit"
            disabled={isPending || !toAccountId}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Guardar
          </button>
        </form>
      )}

      <ul className="mt-2 space-y-1 text-sm">
        {relations.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2">
            <span className="min-w-0 text-gray-900">
              <span className="text-gray-500">{r.label} </span>
              <Link href={`/crm/cuentas/${r.otherId}`} className="text-indigo-600 hover:text-indigo-800">
                {r.otherName}
              </Link>
              {r.note && <span className="text-gray-400"> · {r.note}</span>}
            </span>
            <button
              onClick={() =>
                startTransition(async () => {
                  await removeAccountRelation(r.id);
                })
              }
              disabled={isPending}
              title="Quitar relación"
              className="text-gray-300 hover:text-gray-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
        {relations.length === 0 && (
          <li className="text-xs text-gray-400">
            Sin relaciones. Aquí se enlazan sociedades hermanas, holding y filial, o quién es
            proveedor o asesor de quién — sin fusionar las cuentas.
          </li>
        )}
      </ul>
    </div>
  );
}
