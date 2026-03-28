"use client";

import { useState, useTransition } from "react";
import { createWorkspace } from "./actions";
import { Plus } from "lucide-react";

export function WorkspaceForm(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(async () => {
      await createWorkspace(data);
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
      >
        <Plus className="h-4 w-4" /> Añadir workspace Jira
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-xl border border-gray-200 p-5 space-y-4"
    >
      <h3 className="font-medium text-gray-900">Nuevo workspace Jira</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Nombre
          </label>
          <input
            name="name"
            required
            placeholder="Gigson Solutions"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Dominio Jira
          </label>
          <input
            name="domain"
            required
            placeholder="tuempresa.atlassian.net"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Email
          </label>
          <input
            name="email"
            required
            type="email"
            placeholder="admin@tuempresa.com"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            API Token de Jira
          </label>
          <input
            name="apiToken"
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
