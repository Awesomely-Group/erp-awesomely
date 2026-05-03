"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { applyProposals } from "./actions";
import type { Proposal, ApplyResult } from "./actions";

interface Project {
  id: string;
  name: string;
  key: string;
  workspaceName: string;
}

const CONFIDENCE_OPTIONS = [
  { label: "Todas", value: 0 },
  { label: "≥ 50%", value: 0.5 },
  { label: "≥ 70%", value: 0.7 },
  { label: "≥ 90%", value: 0.9 },
];

const WORKSPACE_OPTIONS = [
  { label: "Todos", value: "" },
  { label: "Awesomely", value: "Awesomely" },
  { label: "Gigson", value: "Gigson" },
  { label: "Gigson Solutions", value: "Gigson Solutions" },
  { label: "LaTroupe", value: "LaTroupe" },
];

function ConfidenceBadge({ confidence }: { confidence: number | null }): React.JSX.Element {
  if (confidence === null) {
    return <span className="text-xs text-gray-400">—</span>;
  }
  const pct = Math.round(confidence * 100);
  const color =
    pct >= 70
      ? "bg-green-100 text-green-700"
      : pct >= 40
        ? "bg-amber-100 text-amber-700"
        : "bg-red-100 text-red-700";
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>
      {pct}%
    </span>
  );
}

export function AutoClassifyTable({
  proposals,
  projects,
}: {
  proposals: Proposal[];
  projects: Project[];
}): React.JSX.Element {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(proposals.filter((p) => p.topSuggestion).map((p) => p.lineId))
  );
  const [overrides, setOverrides] = useState<Map<string, string | null>>(new Map());
  const [editingLine, setEditingLine] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [results, setResults] = useState<ApplyResult[] | null>(null);
  const [minConfidence, setMinConfidence] = useState(0);
  const [workspaceFilter, setWorkspaceFilter] = useState("");
  const [showFilter, setShowFilter] = useState<"all" | "with" | "without">("all");

  const filtered = useMemo(
    () =>
      proposals.filter((p) => {
        const confidence = p.topSuggestion?.confidence ?? null;
        const workspace = p.topSuggestion?.workspaceName ?? null;
        if (showFilter === "with" && !p.topSuggestion) return false;
        if (showFilter === "without" && p.topSuggestion) return false;
        if (minConfidence > 0 && (confidence === null || confidence < minConfidence)) return false;
        if (workspaceFilter && workspace !== workspaceFilter) return false;
        return true;
      }),
    [proposals, minConfidence, workspaceFilter, showFilter]
  );

  function toggleSelect(lineId: string): void {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  }

  function toggleAll(): void {
    if (selectedIds.size === filtered.length && filtered.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((p) => p.lineId)));
    }
  }

  function selectByConfidence(minConf: number): void {
    const ids = filtered
      .filter((p) => (p.topSuggestion?.confidence ?? 0) >= minConf)
      .map((p) => p.lineId);
    setSelectedIds(new Set(ids));
  }

  function getEffectiveProjectId(lineId: string, proposal: Proposal): string | null {
    if (overrides.has(lineId)) return overrides.get(lineId) ?? null;
    return proposal.topSuggestion?.projectId ?? null;
  }

  async function handleApply(): Promise<void> {
    const items = filtered
      .filter((p) => selectedIds.has(p.lineId))
      .map((p) => ({
        lineId: p.lineId,
        invoiceId: p.invoiceId,
        projectId: getEffectiveProjectId(p.lineId, p),
        notes: "",
      }));

    if (items.length === 0) return;

    setApplying(true);
    setResults(null);
    try {
      const res = await applyProposals(items);
      setResults(res);
      const successIds = new Set(res.filter((r) => r.success).map((r) => r.lineId));
      setSelectedIds((prev) => new Set([...prev].filter((id) => !successIds.has(id))));
      router.refresh();
    } finally {
      setApplying(false);
    }
  }

  const successCount = results?.filter((r) => r.success).length ?? 0;
  const errorCount = results?.filter((r) => !r.success).length ?? 0;
  const selectedInFiltered = filtered.filter((p) => selectedIds.has(p.lineId)).length;

  const withSuggestion = proposals.filter((p) => p.topSuggestion).length;
  const withoutSuggestion = proposals.length - withSuggestion;

  return (
    <div className="space-y-4">
      {/* Summary banner */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-center justify-between gap-4">
        <div className="text-sm text-indigo-900">
          <span className="font-semibold">{withSuggestion} propuestas listas</span>
          {" "}para aplicar
          {withoutSuggestion > 0 && (
            <span className="ml-2 text-indigo-500">· {withoutSuggestion} sin sugerencia</span>
          )}
          <span className="ml-3 text-indigo-600">→ Revisa, deselecciona lo que no aceptes y aplica.</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() =>
              setSelectedIds(new Set(filtered.filter((p) => p.topSuggestion).map((p) => p.lineId)))
            }
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
          >
            Seleccionar todas
          </button>
          <span className="text-indigo-300">|</span>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-indigo-500 hover:text-indigo-700 transition-colors"
          >
            Deseleccionar todas
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 font-medium whitespace-nowrap">
            Confianza mínima
          </label>
          <select
            value={minConfidence}
            onChange={(e) => setMinConfidence(Number(e.target.value))}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1"
          >
            {CONFIDENCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 font-medium">Workspace</label>
          <select
            value={workspaceFilter}
            onChange={(e) => setWorkspaceFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1"
          >
            {WORKSPACE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 font-medium">Mostrar</label>
          <select
            value={showFilter}
            onChange={(e) => setShowFilter(e.target.value as "all" | "with" | "without")}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1"
          >
            <option value="all">Todas las líneas</option>
            <option value="with">Con sugerencia</option>
            <option value="without">Sin sugerencia</option>
          </select>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={() => selectByConfidence(0.9)}
            className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            Selec. ≥90%
          </button>
          <button
            onClick={() => selectByConfidence(0.7)}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
          >
            Selec. ≥70%
          </button>
          <button
            onClick={() => selectByConfidence(0.5)}
            className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            Selec. ≥50%
          </button>
        </div>
      </div>

      {/* Results banner */}
      {results && (
        <div
          className={`rounded-xl border p-4 text-sm ${
            errorCount > 0
              ? "bg-amber-50 border-amber-200"
              : "bg-green-50 border-green-200"
          }`}
        >
          {successCount > 0 && (
            <span className="text-green-700 font-medium">
              {successCount} clasificaciones aplicadas correctamente.{" "}
            </span>
          )}
          {errorCount > 0 && (
            <span className="text-amber-700 font-medium">
              {errorCount} líneas no se pudieron clasificar.
            </span>
          )}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && selectedIds.size >= filtered.length}
                  onChange={toggleAll}
                  className="rounded"
                />
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Factura</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Proveedor</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Línea</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">Importe</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">
                Proyecto propuesto
              </th>
              <th className="px-4 py-3 text-center font-medium text-gray-600">Confianza</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Motivo</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                  No hay líneas que coincidan con los filtros seleccionados.
                </td>
              </tr>
            )}
            {filtered.map((proposal) => {
              const effectiveProjectId = getEffectiveProjectId(proposal.lineId, proposal);
              const effectiveProject = projects.find((p) => p.id === effectiveProjectId);
              const isEditing = editingLine === proposal.lineId;
              const isSelected = selectedIds.has(proposal.lineId);

              return (
                <tr
                  key={proposal.lineId}
                  className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors ${
                    isSelected ? "bg-indigo-50/40" : ""
                  }`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(proposal.lineId)}
                      className="rounded"
                    />
                  </td>
                  <td className="px-4 py-3 text-gray-700 font-mono text-xs whitespace-nowrap">
                    {proposal.invoiceNumber ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-[140px] truncate" title={proposal.counterparty ?? ""}>
                    {proposal.counterparty ?? "—"}
                  </td>
                  <td
                    className="px-4 py-3 text-gray-900 max-w-[220px] truncate"
                    title={proposal.lineName}
                  >
                    {proposal.lineName}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700 tabular-nums whitespace-nowrap">
                    {proposal.totalEur.toLocaleString("es-ES", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    €
                  </td>
                  <td className="px-4 py-3 min-w-[200px]">
                    {isEditing ? (
                      <select
                        autoFocus
                        value={effectiveProjectId ?? ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setOverrides((prev) => {
                            const next = new Map(prev);
                            next.set(proposal.lineId, val === "" ? null : val);
                            return next;
                          });
                          setEditingLine(null);
                        }}
                        onBlur={() => setEditingLine(null)}
                        className="text-sm border border-gray-200 rounded-lg px-2 py-1 w-full"
                      >
                        <option value="">Awesomely (sin proyecto Jira)</option>
                        {Array.from(new Set(projects.map((p) => p.workspaceName)))
                          .sort()
                          .map((ws) => (
                            <optgroup key={ws} label={ws}>
                              {projects
                                .filter((p) => p.workspaceName === ws)
                                .map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name} ({p.key})
                                  </option>
                                ))}
                            </optgroup>
                          ))}
                      </select>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="truncate">
                          {effectiveProject ? (
                            <>
                              <span className="text-gray-900">{effectiveProject.name}</span>
                              <span className="ml-1 text-xs text-gray-400">
                                ({effectiveProject.workspaceName})
                              </span>
                            </>
                          ) : (
                            <span className="text-gray-400 text-xs">
                              Sin proyecto (Awesomely)
                            </span>
                          )}
                        </span>
                        <button
                          onClick={() => setEditingLine(proposal.lineId)}
                          className="text-xs text-indigo-500 hover:text-indigo-700 flex-shrink-0 transition-colors"
                        >
                          Cambiar
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <ConfidenceBadge
                      confidence={proposal.topSuggestion?.confidence ?? null}
                    />
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {proposal.topSuggestion?.reason ?? "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {filtered.length} líneas visibles · {selectedInFiltered} seleccionadas
        </p>
        <button
          onClick={handleApply}
          disabled={selectedInFiltered === 0 || applying}
          className="inline-flex items-center gap-2 bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {applying
            ? "Clasificando…"
            : `Aplicar ${selectedInFiltered > 0 ? selectedInFiltered : ""} clasificaciones`}
        </button>
      </div>
    </div>
  );
}
