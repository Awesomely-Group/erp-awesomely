"use client";

import { useState, useMemo, useRef, useEffect, useTransition } from "react";
import { ProjectStatus } from "@prisma/client";
import { updateProjectStatus } from "./actions";

export interface ProjectRow {
  id: string;
  jiraKey: string;
  name: string;
  workspaceName: string;
  status: ProjectStatus;
}

const STATUS_LABELS: Record<ProjectStatus, string> = {
  NOT_STARTED: "Sin iniciar",
  ONGOING: "En curso",
  PAUSED: "Pausado",
  DONE: "Completado",
  ARCHIVED: "Archivado",
};

const STATUS_CLASSES: Record<ProjectStatus, string> = {
  NOT_STARTED: "bg-gray-100 text-gray-600",
  ONGOING: "bg-blue-100 text-blue-700",
  PAUSED: "bg-amber-100 text-amber-700",
  DONE: "bg-green-100 text-green-700",
  ARCHIVED: "bg-red-100 text-red-600",
};

const ALL_STATUSES = Object.values(ProjectStatus) as ProjectStatus[];

interface StatusBadgeProps {
  projectId: string;
  status: ProjectStatus;
}

function StatusBadge({ projectId, status }: StatusBadgeProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [optimisticStatus, setOptimisticStatus] = useState<ProjectStatus>(status);
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  // Sync when parent status changes (e.g. after revalidation)
  useEffect(() => {
    setOptimisticStatus(status);
  }, [status]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function handleSelect(newStatus: ProjectStatus): void {
    setOpen(false);
    setOptimisticStatus(newStatus);
    startTransition(async () => {
      await updateProjectStatus(projectId, newStatus);
    });
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium transition-opacity cursor-pointer ${STATUS_CLASSES[optimisticStatus]} ${isPending ? "opacity-60" : "hover:opacity-80"}`}
      >
        {STATUS_LABELS[optimisticStatus]}
        <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[140px]">
          {ALL_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => handleSelect(s)}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors flex items-center gap-2 ${s === optimisticStatus ? "font-semibold" : ""}`}
            >
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${STATUS_CLASSES[s]}`}>
                {STATUS_LABELS[s]}
              </span>
              {s === optimisticStatus && (
                <svg className="w-3 h-3 text-indigo-600 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  allProjects: ProjectRow[];
}

export function ProjectsTable({ allProjects }: Props): React.JSX.Element {
  const [search, setSearch] = useState("");
  const [filterBrand, setFilterBrand] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<ProjectStatus | "">("");

  const brandOptions = useMemo(() => {
    const names = Array.from(new Set(allProjects.map((p) => p.workspaceName)));
    return names.sort((a, b) => a.localeCompare(b));
  }, [allProjects]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return allProjects.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q) && !p.jiraKey.toLowerCase().includes(q)) {
        return false;
      }
      if (filterBrand && p.workspaceName !== filterBrand) return false;
      if (filterStatus && p.status !== filterStatus) return false;
      return true;
    });
  }, [allProjects, search, filterBrand, filterStatus]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o clave..."
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-w-[220px]"
        />

        <select
          value={filterBrand}
          onChange={(e) => setFilterBrand(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option value="">Todas las marcas</option>
          {brandOptions.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as ProjectStatus | "")}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option value="">Todos los estados</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>

        {(search || filterBrand || filterStatus) && (
          <button
            type="button"
            onClick={() => { setSearch(""); setFilterBrand(""); setFilterStatus(""); }}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Limpiar filtros
          </button>
        )}

        <span className="ml-auto text-xs text-gray-400">
          {filtered.length} de {allProjects.length} proyectos
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-3 text-left font-medium text-gray-600">Clave</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Proyecto</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Marca</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Estado</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((project) => (
              <tr
                key={project.id}
                className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors"
              >
                <td className="px-4 py-3">
                  <span className="font-mono text-xs bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">
                    {project.jiraKey}
                  </span>
                </td>
                <td className="px-4 py-3 font-medium text-gray-900">{project.name}</td>
                <td className="px-4 py-3 text-gray-500">{project.workspaceName}</td>
                <td className="px-4 py-3">
                  <StatusBadge projectId={project.id} status={project.status} />
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  {allProjects.length === 0
                    ? "Sin proyectos sincronizados"
                    : "Sin resultados para los filtros aplicados"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
