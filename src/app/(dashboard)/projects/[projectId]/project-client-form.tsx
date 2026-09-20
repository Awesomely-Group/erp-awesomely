"use client";

import { useState, useTransition } from "react";
import { setProjectCrmAccount } from "../actions";

export interface ClientOption {
  id: string;
  name: string;
}

interface Props {
  projectId: string;
  crmAccountId: string | null;
  options: ClientOption[];
}

/**
 * Cliente del proyecto. Es el único camino de "cliente X" → "sus bolsas de horas", así
 * que de aquí depende que el portal enseñe algo: un proyecto sin cliente no aparece en
 * ninguno.
 *
 * Widget pequeño y aparte del `ProjectSettingsPanel` grande, mismo criterio que
 * `GiroLinkForm`: no comparte estado con precio cerrado/bolsas/fee.
 */
export function ProjectClientForm({ projectId, crmAccountId, options }: Props): React.JSX.Element {
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>): void {
    const value = e.target.value === "" ? null : e.target.value;
    startTransition(async () => {
      const result = await setProjectCrmAccount(projectId, value);
      setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500" htmlFor="project-client">Cliente</label>
        <select
          id="project-client"
          defaultValue={crmAccountId ?? ""}
          onChange={handleChange}
          disabled={isPending}
          className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white disabled:opacity-50"
        >
          <option value="">— Sin cliente —</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {options.length === 0 && (
        <p className="text-xs text-gray-400">No hay cuentas marcadas como cliente en el CRM.</p>
      )}
    </div>
  );
}
