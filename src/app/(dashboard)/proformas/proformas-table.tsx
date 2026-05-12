"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatCurrency, formatDate, holdedProformaUrl } from "@/lib/utils";
import { MARCA_OPTIONS } from "@/lib/org";
import { classifyProforma } from "./actions";

type Project = { id: string; name: string };

type ProformaRow = {
  id: string;
  holdedId: string;
  number: string | null;
  counterparty: string | null;
  description: string | null;
  tags: string[];
  date: Date;
  dueDate: Date | null;
  holdedStatus: number | null;
  currency: string;
  subtotal: unknown;
  totalEur: unknown;
  marca: string | null;
  projectId: string | null;
  project: { id: string; name: string } | null;
};

function statusBadge(status: number | null): React.JSX.Element {
  const s = status ?? 0;
  const map: Record<number, { label: string; cls: string }> = {
    [-1]: { label: "Cancelada", cls: "bg-red-100 text-red-700" },
    [0]: { label: "Borrador", cls: "bg-gray-100 text-gray-600" },
    [1]: { label: "Enviada", cls: "bg-yellow-100 text-yellow-700" },
    [2]: { label: "Aceptada", cls: "bg-green-100 text-green-700" },
  };
  const { label, cls } = map[s] ?? { label: `Estado ${s}`, cls: "bg-gray-100 text-gray-600" };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

function MarcaCell({
  proformaId,
  marca,
}: {
  proformaId: string;
  marca: string | null;
}): React.JSX.Element {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  function save(value: string | null): void {
    startTransition(async () => {
      await classifyProforma(proformaId, { marca: value });
    });
    setEditing(false);
  }

  if (editing) {
    return (
      <select
        autoFocus
        defaultValue={marca ?? ""}
        onBlur={(e) => save(e.target.value || null)}
        onChange={(e) => save(e.target.value || null)}
        className="text-xs rounded border border-indigo-300 px-1.5 py-0.5 bg-white"
        disabled={pending}
      >
        <option value="">Sin asignar</option>
        {MARCA_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={`text-xs rounded-full px-2 py-0.5 font-medium transition-colors hover:opacity-80 ${
        marca
          ? "bg-indigo-100 text-indigo-700"
          : "bg-gray-100 text-gray-400 hover:bg-gray-200"
      }`}
    >
      {marca ?? "Sin asignar"}
    </button>
  );
}

function ProjectCell({
  proformaId,
  projectId,
  project,
  projects,
}: {
  proformaId: string;
  projectId: string | null;
  project: { id: string; name: string } | null;
  projects: Project[];
}): React.JSX.Element {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  function save(value: string | null): void {
    startTransition(async () => {
      await classifyProforma(proformaId, { projectId: value });
    });
    setEditing(false);
  }

  if (editing) {
    return (
      <select
        autoFocus
        defaultValue={projectId ?? ""}
        onBlur={(e) => save(e.target.value || null)}
        onChange={(e) => save(e.target.value || null)}
        className="text-xs rounded border border-indigo-300 px-1.5 py-0.5 bg-white max-w-[180px]"
        disabled={pending}
      >
        <option value="">Sin proyecto</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={`text-xs rounded-full px-2 py-0.5 font-medium transition-colors hover:opacity-80 truncate max-w-[160px] ${
        project
          ? "bg-blue-100 text-blue-700"
          : "bg-gray-100 text-gray-400 hover:bg-gray-200"
      }`}
    >
      {project?.name ?? "Sin proyecto"}
    </button>
  );
}

export function ProformasTable({
  proformas,
  projects,
  selectedId,
}: {
  proformas: ProformaRow[];
  projects: Project[];
  selectedId?: string;
}): React.JSX.Element {
  const router = useRouter();
  const sp = useSearchParams();

  function handleRowClick(id: string): void {
    const params = new URLSearchParams(sp.toString());
    if (params.get("proformaId") === id) {
      params.delete("proformaId");
    } else {
      params.set("proformaId", id);
    }
    router.push(`/proformas?${params.toString()}`);
  }

  if (proformas.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-gray-400">
        No hay proformas con los filtros actuales
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 whitespace-nowrap">Fecha</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 whitespace-nowrap">Número</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Cliente</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Descripción</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Tags</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 whitespace-nowrap">Estado</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Marca</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Proyecto</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 whitespace-nowrap">Subtotal</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 whitespace-nowrap">Total (EUR)</th>
            <th className="px-4 py-3 text-center text-xs font-medium text-gray-600">Holded</th>
          </tr>
        </thead>
        <tbody>
          {proformas.map((pf) => {
            const isSelected = pf.id === selectedId;
            return (
            <tr
              key={pf.id}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("a, button, select")) return;
                handleRowClick(pf.id);
              }}
              className={`cursor-pointer border-b border-gray-100 last:border-0 transition-colors ${
                isSelected ? "bg-indigo-50 hover:bg-indigo-100" : "hover:bg-gray-50"
              }`}
            >
              <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                {formatDate(pf.date.toISOString())}
              </td>
              <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                {pf.number ?? <span className="italic text-gray-400 font-normal">Borrador</span>}
              </td>
              <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">
                {pf.counterparty ?? "—"}
              </td>
              <td className="px-4 py-3 text-gray-500 max-w-[180px] truncate text-xs">
                {pf.description ?? "—"}
              </td>
              <td className="px-4 py-3">
                {pf.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {pf.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-violet-100 text-violet-700"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-gray-300 text-xs">—</span>
                )}
              </td>
              <td className="px-4 py-3">
                {statusBadge(pf.holdedStatus)}
              </td>
              <td className="px-4 py-3">
                <MarcaCell proformaId={pf.id} marca={pf.marca} />
              </td>
              <td className="px-4 py-3">
                <ProjectCell
                  proformaId={pf.id}
                  projectId={pf.projectId}
                  project={pf.project}
                  projects={projects}
                />
              </td>
              <td className="px-4 py-3 text-right text-gray-500 whitespace-nowrap">
                {pf.currency !== "EUR" ? (
                  <span className="text-xs text-gray-400">{pf.currency} </span>
                ) : null}
                {formatCurrency(Number(pf.subtotal))}
              </td>
              <td className="px-4 py-3 text-right font-medium text-green-700 whitespace-nowrap">
                {formatCurrency(Number(pf.totalEur))}
              </td>
              <td className="px-4 py-3 text-center">
                <a
                  href={holdedProformaUrl(pf.holdedId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-gray-400 hover:text-indigo-600 transition-colors"
                  title="Ver en Holded"
                >
                  ↗
                </a>
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
