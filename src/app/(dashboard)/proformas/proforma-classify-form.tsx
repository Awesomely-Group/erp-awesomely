"use client";

import { useState, useTransition } from "react";
import { MARCA_OPTIONS } from "@/lib/org";
import { classifyProforma } from "./actions";

type Project = { id: string; name: string };

interface Props {
  proformaId: string;
  initialMarca: string | null;
  initialProjectId: string | null;
  initialNotes: string | null;
  projects: Project[];
}

export function ProformaClassifyForm({
  proformaId,
  initialMarca,
  initialProjectId,
  initialNotes,
  projects,
}: Props): React.JSX.Element {
  const [marca, setMarca] = useState(initialMarca ?? "");
  const [projectId, setProjectId] = useState(initialProjectId ?? "");
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSave(): void {
    setSaved(false);
    startTransition(async () => {
      await classifyProforma(proformaId, {
        marca: marca || null,
        projectId: projectId || null,
        notes: notes || null,
      });
      setSaved(true);
    });
  }

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Clasificación</h3>

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Marca</label>
          <select
            value={marca}
            onChange={(e) => { setMarca(e.target.value); setSaved(false); }}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
          >
            <option value="">Sin asignar</option>
            {MARCA_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Proyecto</label>
          <select
            value={projectId}
            onChange={(e) => { setProjectId(e.target.value); setSaved(false); }}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
          >
            <option value="">Sin proyecto</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Notas</label>
          <textarea
            value={notes}
            onChange={(e) => { setNotes(e.target.value); setSaved(false); }}
            rows={3}
            placeholder="Observaciones sobre esta proforma…"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-none"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Guardando…" : "Guardar clasificación"}
        </button>
        {saved && (
          <span className="text-xs text-green-600 font-medium">Guardado</span>
        )}
      </div>
    </div>
  );
}
