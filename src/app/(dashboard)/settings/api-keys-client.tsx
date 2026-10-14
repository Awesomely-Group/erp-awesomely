"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createApiKey, deleteApiKey, type ApiKeyFormState } from "./actions";

const FECHA = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" });

type ApiKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  scopeLabels: string[];
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
};

type ScopeOption = { value: string; label: string; hint: string };

export function ApiKeysClient({
  keys,
  canMint,
  noAccessReason,
  grantExpiresAt,
  scopeOptions,
}: {
  keys: ApiKeyRow[];
  canMint: boolean;
  noAccessReason: string;
  grantExpiresAt: Date | null;
  scopeOptions: ScopeOption[];
}): React.JSX.Element {
  const [createState, createAction] = useActionState(createApiKey, undefined as ApiKeyFormState);
  const [deleteState, deleteAction] = useActionState(deleteApiKey, undefined as ApiKeyFormState);

  const [revealed, setRevealed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (createState?.newKey) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reacciona a la respuesta de una server action (useActionState), no a un prop normal
      setRevealed(createState.newKey);
      setCopied(false);
      formRef.current?.reset();
    }
  }, [createState?.newKey]);

  async function handleCopy(): Promise<void> {
    if (!revealed) return;
    await navigator.clipboard.writeText(revealed);
    setCopied(true);
  }

  return (
    <div className="space-y-6">
      {revealed ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
          <p className="text-sm font-medium text-amber-800">
            Copia esta clave ahora — no la volverás a ver
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 block bg-white border border-amber-200 rounded-lg px-3 py-2 text-xs font-mono text-gray-900 truncate select-all">
              {revealed}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              className="shrink-0 rounded-lg bg-amber-600 px-3 py-2 text-xs font-medium text-white hover:bg-amber-700 transition-colors"
            >
              {copied ? "Copiado ✓" : "Copiar"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              setRevealed(null);
              setCopied(false);
            }}
            className="text-xs text-amber-700 hover:text-amber-900 underline"
          >
            Ya la he guardado, cerrar
          </button>
        </div>
      ) : null}

      {!canMint ? (
        <p className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
          {noAccessReason}
        </p>
      ) : null}

      {canMint ? (
        <form ref={formRef} action={createAction} className="space-y-4">
          <div>
            <label htmlFor="api-key-name" className="block text-sm font-medium text-gray-700 mb-1">
              Nombre de la clave
            </label>
            <input
              id="api-key-name"
              name="name"
              type="text"
              required
              maxLength={64}
              placeholder="Ej: Claude Desktop, Cursor, CI/CD…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <fieldset>
            <legend className="block text-sm font-medium text-gray-700 mb-1">Permisos</legend>
            <p className="text-xs text-gray-500 mb-2">
              Marca solo lo que esta clave necesite. Es mejor varias claves con permisos distintos
              que una que lo pueda todo.
            </p>
            <div className="space-y-2">
              {scopeOptions.map((scope) => (
                <label key={scope.value} className="flex gap-2 items-start">
                  <input
                    type="checkbox"
                    name="scopes"
                    value={scope.value}
                    className="mt-1 accent-indigo-600"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm text-gray-900">{scope.label}</span>
                    <span className="block text-xs text-gray-500">{scope.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              Generar clave
            </button>
            {grantExpiresAt ? (
              <span className="text-xs text-gray-500">
                Caducará con tu autorización, el {FECHA.format(grantExpiresAt)}.
              </span>
            ) : null}
          </div>
        </form>
      ) : null}

      {createState?.error ? (
        <p className="text-sm text-red-600" role="alert">
          {createState.error}
        </p>
      ) : null}

      {keys.length > 0 ? (
        <ul className="divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white">
          {keys.map((k) => (
            <li key={k.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {k.name}
                  {k.revokedAt ? (
                    <span className="ml-2 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                      Revocada
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-gray-400 mt-0.5 font-mono">
                  {k.keyPrefix}••••••••••••••••••••••••••••••••••••••
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {k.scopeLabels.join(" · ") || "Sin permisos"}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Creada {FECHA.format(k.createdAt)}
                  {k.lastUsedAt ? ` · Último uso ${FECHA.format(k.lastUsedAt)}` : " · Nunca usada"}
                  {k.revokedAt ? "" : ` · Caduca ${FECHA.format(k.expiresAt)}`}
                </p>
              </div>
              {k.revokedAt ? null : (
                <form action={deleteAction}>
                  <input type="hidden" name="id" value={k.id} />
                  <button
                    type="submit"
                    className="text-sm font-medium text-red-600 hover:text-red-700 shrink-0"
                  >
                    Revocar
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-400">No tienes ninguna clave creada.</p>
      )}

      {deleteState?.error ? (
        <p className="text-sm text-red-600" role="alert">
          {deleteState.error}
        </p>
      ) : null}
    </div>
  );
}
