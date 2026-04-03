"use client";

import { useActionState } from "react";
import {
  addSsoAllowedEmail,
  removeSsoAllowedEmail,
  type SsoAllowlistFormState,
} from "./actions";

type Entry = { id: string; email: string };

export function SsoAllowlistClient({ entries }: { entries: Entry[] }): React.JSX.Element {
  const [addState, addAction] = useActionState(
    addSsoAllowedEmail,
    undefined as SsoAllowlistFormState
  );
  const [removeState, removeAction] = useActionState(
    removeSsoAllowedEmail,
    undefined as SsoAllowlistFormState
  );

  const disableRemove = entries.length <= 1;

  return (
    <div className="space-y-6">
      <form action={addAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 min-w-0">
          <label
            htmlFor="sso-email"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Añadir email
          </label>
          <input
            id="sso-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="persona@empresa.com"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors shrink-0"
        >
          Añadir
        </button>
      </form>
      {addState?.error ? (
        <p className="text-sm text-red-600" role="alert">
          {addState.error}
        </p>
      ) : null}

      <ul className="divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white">
        {entries.map((e) => (
          <li
            key={e.id}
            className="flex items-center justify-between gap-3 px-4 py-3"
          >
            <span className="text-sm text-gray-900 truncate">{e.email}</span>
            <form action={removeAction}>
              <input type="hidden" name="id" value={e.id} />
              <button
                type="submit"
                disabled={disableRemove}
                title={
                  disableRemove
                    ? "Debe existir al menos un email autorizado"
                    : "Quitar acceso"
                }
                className="text-sm font-medium text-red-600 hover:text-red-700 disabled:text-gray-400 disabled:cursor-not-allowed shrink-0"
              >
                Quitar
              </button>
            </form>
          </li>
        ))}
      </ul>
      {removeState?.error ? (
        <p className="text-sm text-red-600" role="alert">
          {removeState.error}
        </p>
      ) : null}
    </div>
  );
}
