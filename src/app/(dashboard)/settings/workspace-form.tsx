"use client";

import { useState, useTransition } from "react";
import { createWorkspace, updateWorkspace } from "./actions";
import { Plus, Pencil } from "lucide-react";

// ─── Edit form for an existing workspace ─────────────────────────────────────

interface WorkspaceEditProps {
  id: string;
  domain: string;
  email: string;
  onClose: () => void;
}

export function WorkspaceEdit({ id, domain, email, onClose }: WorkspaceEditProps): React.JSX.Element {
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(async () => {
      await updateWorkspace(id, data);
      onClose();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 bg-gray-50 rounded-lg border border-gray-200 p-4 space-y-3"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Dominio Jira</label>
          <input
            name="domain"
            required
            defaultValue={domain}
            placeholder="tuempresa.atlassian.net"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
          <input
            name="email"
            required
            type="email"
            defaultValue={email}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            API Token <span className="text-gray-400">(dejar vacío para no cambiar)</span>
          </label>
          <input
            name="apiToken"
            type="password"
            placeholder="••••••••••••"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
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

// ─── Workspace card with inline edit toggle ────────────────────────────────

interface WorkspaceCardProps {
  id: string;
  name: string;
  domain: string;
  email: string;
  active: boolean;
}

export function WorkspaceCard({ id, name, domain, email, active }: WorkspaceCardProps): React.JSX.Element {
  const [editing, setEditing] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-gray-900">{name}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {domain} · {email}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditing((v) => !v)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
            title="Editar"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
            }`}
          >
            {active ? "Activo" : "Inactivo"}
          </span>
        </div>
      </div>
      {editing && (
        <WorkspaceEdit id={id} domain={domain} email={email} onClose={() => setEditing(false)} />
      )}
    </div>
  );
}

// ─── New workspace form ────────────────────────────────────────────────────

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
          <label className="block text-xs font-medium text-gray-600 mb-1">Nombre</label>
          <input
            name="name"
            required
            placeholder="Gigson Solutions"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Dominio Jira</label>
          <input
            name="domain"
            required
            placeholder="tuempresa.atlassian.net"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
          <input
            name="email"
            required
            type="email"
            placeholder="admin@tuempresa.com"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">API Token de Jira</label>
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
