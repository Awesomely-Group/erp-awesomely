"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createApiKey, deleteApiKey, type ApiKeyFormState } from "./actions";

type ApiKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  creatorName: string | null;
};

export function ApiKeysClient({
  keys,
}: {
  keys: ApiKeyRow[];
}): React.JSX.Element {
  const [createState, createAction] = useActionState(
    createApiKey,
    undefined as ApiKeyFormState
  );
  const [deleteState, deleteAction] = useActionState(
    deleteApiKey,
    undefined as ApiKeyFormState
  );

  const [revealed, setRevealed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // When a new key is returned, show it and reset the form
  useEffect(() => {
    if (createState?.newKey) {
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

  function handleDismiss(): void {
    setRevealed(null);
    setCopied(false);
  }

  return (
    <div className="space-y-6">
      {/* New-key reveal banner */}
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
            onClick={handleDismiss}
            className="text-xs text-amber-700 hover:text-amber-900 underline"
          >
            Ya la he guardado, cerrar
          </button>
        </div>
      ) : null}

      {/* Create form */}
      <form
        ref={formRef}
        action={createAction}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <div className="flex-1 min-w-0">
          <label
            htmlFor="api-key-name"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
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
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors shrink-0"
        >
          Generar clave
        </button>
      </form>
      {createState?.error ? (
        <p className="text-sm text-red-600" role="alert">
          {createState.error}
        </p>
      ) : null}

      {/* Keys list */}
      {keys.length > 0 ? (
        <ul className="divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white">
          {keys.map((k) => (
            <li
              key={k.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {k.name}
                </p>
                <p className="text-xs text-gray-400 mt-0.5 font-mono">
                  {k.keyPrefix}••••••••••••••••••••••••••••••••••••••
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Creada{" "}
                  {k.createdAt.toLocaleDateString("es-ES", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                  {k.creatorName ? ` · ${k.creatorName}` : ""}
                  {k.lastUsedAt
                    ? ` · Último uso ${k.lastUsedAt.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}`
                    : " · Nunca usada"}
                </p>
              </div>
              <form action={deleteAction}>
                <input type="hidden" name="id" value={k.id} />
                <button
                  type="submit"
                  className="text-sm font-medium text-red-600 hover:text-red-700 shrink-0"
                >
                  Revocar
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-400">No hay claves de API creadas.</p>
      )}
      {deleteState?.error ? (
        <p className="text-sm text-red-600" role="alert">
          {deleteState.error}
        </p>
      ) : null}
    </div>
  );
}
