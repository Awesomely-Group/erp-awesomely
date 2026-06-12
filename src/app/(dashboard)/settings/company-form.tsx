"use client";

import { useState, useTransition } from "react";
import { createCompany, updateCompany } from "./actions";
import { Plus, Pencil } from "lucide-react";

// ─── Edit form for an existing company ───────────────────────────────────────

interface CompanyEditProps {
  id: string;
  onClose: () => void;
}

function CompanyEdit({ id, onClose }: CompanyEditProps): React.JSX.Element {
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(async () => {
      await updateCompany(id, data);
      onClose();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 bg-gray-50 rounded-lg border border-gray-200 p-4 space-y-3"
    >
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Nueva API Key de Holded
        </label>
        <input
          name="holdedApiKey"
          required
          type="password"
          placeholder="••••••••••••"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors"
        >
          Guardar
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

// ─── Company card with inline edit toggle ─────────────────────────────────────

interface CompanyCardProps {
  id: string;
  name: string;
  holdedApiKey: string;
  active: boolean;
}

export function CompanyCard({ id, name, holdedApiKey, active }: CompanyCardProps): React.JSX.Element {
  const [editing, setEditing] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900">{name}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            API key: ••••••••{holdedApiKey.slice(-4)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditing((v) => !v)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
            title="Editar API key"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <span
            className={`text-xs px-2 py-0.5 rounded-full h-fit ${
              active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
            }`}
          >
            {active ? "Activa" : "Inactiva"}
          </span>
        </div>
      </div>
      {editing && <CompanyEdit id={id} onClose={() => setEditing(false)} />}
    </div>
  );
}

export function CompanyForm(): React.JSX.Element {
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
        type="button"
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
            placeholder="Cuenta en Holded"
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
