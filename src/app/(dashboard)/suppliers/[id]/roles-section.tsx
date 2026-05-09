"use client";

import { useState, useTransition } from "react";
import { createRole, updateRole, deleteRole } from "./actions";
import { roleColorClasses } from "@/lib/role-colors";

type Role = { id: string; name: string; ratePerHour: number };
type Template = { id: string; name: string; color: string };

function RoleRow({
  role,
  supplierId,
}: {
  role: Role;
  supplierId: string;
}): React.JSX.Element {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(role.name);
  const [rate, setRate] = useState(role.ratePerHour.toString());
  const [isPending, startTransition] = useTransition();

  function handleSave(): void {
    startTransition(async () => {
      await updateRole(role.id, supplierId, name, rate);
      setEditing(false);
    });
  }

  function handleDelete(): void {
    startTransition(async () => {
      await deleteRole(role.id, supplierId);
    });
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 last:border-0">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre del rol"
          className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
          autoFocus
        />
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            min="0"
            step="0.01"
            placeholder="0.00"
            className="w-24 border border-gray-300 rounded px-2 py-1 text-sm text-right"
          />
          <span className="text-sm text-gray-500">€/h</span>
        </div>
        <button
          onClick={handleSave}
          disabled={isPending || !name.trim() || !rate}
          className="text-sm bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-700 disabled:opacity-50"
        >
          Guardar
        </button>
        <button
          onClick={() => { setName(role.name); setRate(role.ratePerHour.toString()); setEditing(false); }}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Cancelar
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 last:border-0">
      <span className="flex-1 text-sm font-medium text-gray-800">{role.name}</span>
      <span className="text-sm text-gray-600 tabular-nums">
        {role.ratePerHour.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/h
      </span>
      <button
        onClick={() => setEditing(true)}
        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
      >
        Editar
      </button>
      <button
        onClick={handleDelete}
        disabled={isPending}
        className="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50"
      >
        Eliminar
      </button>
    </div>
  );
}

function AddRoleForm({
  supplierId,
  templates,
}: {
  supplierId: string;
  templates: Template[];
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [rate, setRate] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    if (!name.trim() || !rate) return;
    startTransition(async () => {
      await createRole(supplierId, name, rate);
      setName("");
      setRate("");
      setOpen(false);
    });
  }

  function selectTemplate(t: Template): void {
    setName(t.name);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium mt-2 inline-block"
      >
        + Añadir rol
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 pt-2 border-t border-gray-100 flex flex-col gap-2">
      {templates.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {templates.map((t) => {
            const { bg, text } = roleColorClasses(t.color);
            const selected = name === t.name;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => selectTemplate(t)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${bg} ${text} ${selected ? "ring-2 ring-offset-1 ring-indigo-400" : "opacity-70 hover:opacity-100"}`}
              >
                {selected && (
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {t.name}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre del rol"
          required
          className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
          autoFocus={templates.length === 0}
        />
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            min="0"
            step="0.01"
            placeholder="0.00"
            required
            className="w-24 border border-gray-300 rounded px-2 py-1 text-sm text-right"
          />
          <span className="text-sm text-gray-500">€/h</span>
        </div>
        <button
          type="submit"
          disabled={isPending || !name.trim() || !rate}
          className="text-sm bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-700 disabled:opacity-50"
        >
          {isPending ? "Creando…" : "Crear"}
        </button>
        <button
          type="button"
          onClick={() => { setName(""); setRate(""); setOpen(false); }}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function RolesSection({
  supplierId,
  roles,
  templates = [],
}: {
  supplierId: string;
  roles: Role[];
  templates?: Template[];
}): React.JSX.Element {
  return (
    <div className="bg-white rounded-lg border border-gray-200 mb-6">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Roles y tarifas</h2>
        {roles.length > 0 && (
          <span className="text-xs text-gray-400">{roles.length} rol{roles.length !== 1 ? "es" : ""}</span>
        )}
      </div>

      {roles.length === 0 ? (
        <div className="px-4 py-4">
          <p className="text-sm text-gray-400">Sin roles definidos.</p>
          <AddRoleForm supplierId={supplierId} templates={templates} />
        </div>
      ) : (
        <div>
          {roles.map((role) => (
            <RoleRow key={role.id} role={role} supplierId={supplierId} />
          ))}
          <div className="px-4 pb-3">
            <AddRoleForm supplierId={supplierId} templates={templates} />
          </div>
        </div>
      )}
    </div>
  );
}
