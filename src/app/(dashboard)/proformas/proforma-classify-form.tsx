"use client";

import { useState, useTransition } from "react";
import { MARCA_OPTIONS } from "@/lib/org";
import { filterProjectsByMarca } from "@/lib/org";
import { classifyProforma } from "./actions";
import { ProjectCombobox } from "./project-combobox";

type Project = { id: string; name: string; workspaceName: string };

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

  const availableProjects = filterProjectsByMarca(projects, marca || null);

  function handleMarcaChange(value: string): void {
    setMarca(value);
    setSaved(false);
    if (projectId) {
      const stillAvailable = filterProjectsByMarca(projects, value || null).some((p) => p.id === projectId);
      if (!stillAvailable) setProjectId("");
    }
  }

  function handleProjectChange(id: string): void {
    setProjectId(id);
    setSaved(false);
    if (id) {
      const proj = projects.find((p) => p.id === id);
      if (proj?.workspaceName && proj.workspaceName !== marca) {
        setMarca(proj.workspaceName);
      }
    }
  }

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
            onChange={(e) => handleMarcaChange(e.target.value)}
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
          <ProjectCombobox
            projects={availableProjects}
            value={projectId}
            onChange={handleProjectChange}
            disabled={isPending}
          />
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
