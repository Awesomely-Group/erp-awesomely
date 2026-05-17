"use client";

import { useState, useTransition } from "react";
import { ROLE_COLOR_KEYS, roleColorClasses } from "@/lib/role-colors";
import { createRoleTemplate, updateRoleTemplate, deleteRoleTemplate } from "./role-templates-actions";

export interface RoleTemplateItem {
  id: string;
  name: string;
  color: string;
  ratePerHour: number;
}

// ─── Color picker ─────────────────────────────────────────────────────────────

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ROLE_COLOR_KEYS.map((c) => {
        const { dot } = roleColorClasses(c);
        return (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={`w-5 h-5 rounded-full ${dot} ring-offset-1 transition-all ${value === c ? "ring-2 ring-gray-500" : "hover:opacity-80"}`}
            title={c}
          />
        );
      })}
    </div>
  );
}

// ─── Pill ─────────────────────────────────────────────────────────────────────

function RolePill({ name, color }: { name: string; color: string }): React.JSX.Element {
  const { bg, text } = roleColorClasses(color);
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${bg} ${text}`}>
      {name}
    </span>
  );
}

// ─── Row de plantilla ─────────────────────────────────────────────────────────

function TemplateRow({
  template,
}: {
  template: RoleTemplateItem;
}): React.JSX.Element {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(template.name);
  const [color, setColor] = useState(template.color);
  const [ratePerHour, setRatePerHour] = useState(template.ratePerHour.toString());
  const [isPending, startTransition] = useTransition();

  function handleSave(): void {
    startTransition(async () => {
      await updateRoleTemplate(template.id, name, color, ratePerHour !== "" ? parseFloat(ratePerHour) : 0);
      setEditing(false);
    });
  }

  function handleDelete(): void {
    startTransition(async () => {
      await deleteRoleTemplate(template.id);
    });
  }

  if (editing) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0 flex-wrap">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1 text-sm w-40"
          autoFocus
        />
        <div className="flex items-center gap-1">
          <input
            type="number"
            min="0"
            step="0.01"
            value={ratePerHour}
            onChange={(e) => setRatePerHour(e.target.value)}
            placeholder="0.00"
            className="border border-gray-300 rounded px-2 py-1 text-sm w-24"
          />
          <span className="text-xs text-gray-500">€/h</span>
        </div>
        <ColorPicker value={color} onChange={setColor} />
        <button
          onClick={handleSave}
          disabled={isPending || !name.trim()}
          className="text-sm bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-700 disabled:opacity-50"
        >
          Guardar
        </button>
        <button
          onClick={() => { setName(template.name); setColor(template.color); setRatePerHour(template.ratePerHour.toString()); setEditing(false); }}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Cancelar
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0">
      <RolePill name={template.name} color={template.color} />
      <span className="text-xs text-gray-400">{template.ratePerHour > 0 ? `${template.ratePerHour}€/h` : "—"}</span>
      <div className="ml-auto flex items-center gap-3">
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
    </div>
  );
}

// ─── Formulario de creación ───────────────────────────────────────────────────

function AddTemplateForm(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("gray");
  const [ratePerHour, setRatePerHour] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    if (!name.trim()) return;
    startTransition(async () => {
      await createRoleTemplate(name, color, ratePerHour !== "" ? parseFloat(ratePerHour) : 0);
      setName("");
      setColor("gray");
      setRatePerHour("");
      setOpen(false);
    });
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
    <form onSubmit={handleSubmit} className="mt-3 pt-3 border-t border-gray-100 flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre del rol"
          required
          className="border border-gray-300 rounded px-2 py-1 text-sm w-40"
          autoFocus
        />
        <div className="flex items-center gap-1">
          <input
            type="number"
            min="0"
            step="0.01"
            value={ratePerHour}
            onChange={(e) => setRatePerHour(e.target.value)}
            placeholder="0.00"
            className="border border-gray-300 rounded px-2 py-1 text-sm w-24"
          />
          <span className="text-xs text-gray-500">€/h</span>
        </div>
        <button
          type="submit"
          disabled={isPending || !name.trim()}
          className="text-sm bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-700 disabled:opacity-50"
        >
          {isPending ? "Creando…" : "Crear"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Cancelar
        </button>
      </div>
      <ColorPicker value={color} onChange={setColor} />
      {name.trim() && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Vista previa:</span>
          <RolePill name={name} color={color} />
        </div>
      )}
    </form>
  );
}

// ─── Sección principal ────────────────────────────────────────────────────────

export function RoleTemplatesSection({
  templates,
}: {
  templates: RoleTemplateItem[];
}): React.JSX.Element {
  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900">Catálogo de roles</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Roles predefinidos que se pueden asignar a los proveedores.
          </p>
        </div>
        {templates.length > 0 && (
          <span className="text-xs text-gray-400">{templates.length} rol{templates.length !== 1 ? "es" : ""}</span>
        )}
      </div>

      {templates.length === 0 ? (
        <div className="px-4 py-4">
          <p className="text-sm text-gray-400">Sin roles definidos.</p>
        </div>
      ) : (
        <div>
          {templates.map((t) => (
            <TemplateRow key={t.id} template={t} />
          ))}
        </div>
      )}

      <div className="px-4 pb-4">
        <AddTemplateForm />
      </div>
    </div>
  );
}
