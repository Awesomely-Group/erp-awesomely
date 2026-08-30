"use client";

import { useState, useTransition } from "react";
import { updateGiroProjectId } from "../actions";

interface Props {
  projectId: string;
  giroProjectId: string | null;
}

/**
 * Vínculo con el proyecto equivalente en Giro (plan 28-ago, F3 — conciliación).
 * Se pide la **key** del proyecto de Giro (p.ej. "AWI"), no su id interno: es lo
 * único que la propia UI de Giro enseña en algún sitio (URLs, listados…); el id
 * (`giroProjectId`, un cuid) no aparece en ninguna pantalla de Giro, así que pedirlo
 * directamente no era usable. La action lo resuelve llamando a Giro.
 *
 * Widget pequeño y aislado del `ProjectSettingsPanel` grande a propósito: no
 * comparte estado con precio cerrado/bolsas/fee, y así no hay que enhebrar este
 * campo por todo ese formulario para una única cosa que además es opcional.
 */
export function GiroLinkForm({ projectId, giroProjectId }: Props): React.JSX.Element {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateGiroProjectId(projectId, key);
      setError(result.error);
      if (!result.error) setKey("");
    });
  }

  function handleUnlink(): void {
    startTransition(async () => {
      const result = await updateGiroProjectId(projectId, "");
      setError(result.error);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <span className="text-xs text-gray-500">
        Giro:{" "}
        {giroProjectId ? (
          <span className="text-green-700 font-medium">vinculado</span>
        ) : (
          <span className="text-gray-400">sin vincular</span>
        )}
      </span>
      <input
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder="key en Giro (ej. AWI)"
        className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs w-40"
      />
      <button
        type="submit"
        disabled={isPending || !key.trim()}
        className="rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors"
      >
        {isPending ? "Vinculando…" : "Vincular"}
      </button>
      {giroProjectId ? (
        <button
          type="button"
          onClick={handleUnlink}
          disabled={isPending}
          className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
        >
          Quitar
        </button>
      ) : null}
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </form>
  );
}
