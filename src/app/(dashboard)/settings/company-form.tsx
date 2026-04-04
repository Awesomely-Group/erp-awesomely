"use client";

import { useState, useTransition } from "react";
import { createCompany } from "./actions";
import { Plus } from "lucide-react";

interface Props {
  legalEntities: { id: string; name: string }[];
}

export function CompanyForm({ legalEntities }: Props): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(async () => {
      await createCompany(data);
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
      >
        <Plus className="h-4 w-4" /> Añadir empresa Holded
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-xl border border-gray-200 p-5 space-y-4"
    >
      <h3 className="font-medium text-gray-900">Nueva empresa Holded</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Nombre
          </label>
          <input
            name="name"
            required
            placeholder="Awesomely SL"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            API Key de Holded
          </label>
          <input
            name="holdedApiKey"
            required
            type="password"
            placeholder="••••••••••••"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Entidad legal (opcional)
          </label>
          <select
            name="legalEntityId"
            className="w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Sin asignar</option>
            {legalEntities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors"
        >
          Guardar
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
