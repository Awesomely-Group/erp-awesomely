"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/utils";
import { classifyLine, saveDraftLineNote } from "./actions";
import { ChevronDown, Sparkles, CheckCircle, Circle, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { accountingAccountTooltip, lineAccountingLabel } from "@/lib/invoice-accounts";

interface Suggestion {
  projectId: string;
  projectName: string;
  workspaceName: string;
  confidence: number;
  reason: string;
}

interface LineClassification {
  id: string;
  status: string;
  projectId: string;
  projectName: string;
  workspaceName: string;
  notes: string | null;
}

interface Line {
  id: string;
  name: string;
  accountingAccount: string | null;
  accountingAccountName: string | null;
  description: string | null;
  notes: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  tax: number;
  total: number;
  totalEur: number;
  currency: string;
  classification: LineClassification | null;
  suggestions: Suggestion[];
}

interface Project {
  id: string;
  name: string;
  key: string;
  workspaceName: string;
}

interface Props {
  invoiceId: string;
  invoiceMarca?: string | null;
  lines: Line[];
  projects: Project[];
}

const STATUS_COLORS: Record<string, string> = {
  CLASSIFIED: "text-blue-600 bg-blue-50 border-blue-200",
  APPROVED: "text-green-600 bg-green-50 border-green-200",
};

export function ClassifyLinesForm({ invoiceId, invoiceMarca, lines, projects }: Props): React.JSX.Element {
  const router = useRouter();
  const [localLines, setLocalLines] = useState(lines);
  const [expandedLine, setExpandedLine] = useState<string | null>(
    lines.find((l) => !l.classification)?.id ?? null
  );
  const [isPending, startTransition] = useTransition();

  function handleClassify(lineId: string, projectId: string, notes: string): void {
    startTransition(async () => {
      const { classificationId } = await classifyLine({ lineId, projectId, notes, invoiceId });
      setLocalLines((prev) =>
        prev.map((l) => {
          if (l.id !== lineId) return l;
          const project = projects.find((p) => p.id === projectId);
          return {
            ...l,
            classification: {
              id: classificationId,
              status: "CLASSIFIED",
              projectId,
              projectName: project?.name ?? "",
              workspaceName: project?.workspaceName ?? "",
              notes,
            },
          };
        })
      );
      const nextUnclassified = localLines.find((l) => l.id !== lineId && !l.classification);
      setExpandedLine(nextUnclassified?.id ?? null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {localLines.map((line) => (
        <LineRow
          key={line.id}
          line={line}
          projects={projects}
          invoiceMarca={invoiceMarca}
          isExpanded={expandedLine === line.id}
          isPending={isPending}
          onToggle={() => setExpandedLine(expandedLine === line.id ? null : line.id)}
          onClassify={(projectId, notes) => handleClassify(line.id, projectId, notes)}
          onSaveDraftNote={(notes) => saveDraftLineNote({ lineId: line.id, notes })}
        />
      ))}
    </div>
  );
}

function LineRow({
  line,
  projects,
  invoiceMarca,
  isExpanded,
  isPending,
  onToggle,
  onClassify,
  onSaveDraftNote,
}: {
  line: Line;
  projects: Project[];
  invoiceMarca?: string | null;
  isExpanded: boolean;
  isPending: boolean;
  onToggle: () => void;
  onClassify: (projectId: string, notes: string) => void;
  onSaveDraftNote: (notes: string) => void;
}): React.JSX.Element {
  const [selectedProject, setSelectedProject] = useState(line.classification?.projectId ?? "");
  const initialNotes = line.classification?.notes ?? line.notes ?? "";
  const [notes, setNotes] = useState(initialNotes);
  const [notesOpen, setNotesOpen] = useState(!!initialNotes);

  // Pre-select the workspace chip that matches the invoice marca (if any)
  const defaultWorkspace =
    invoiceMarca && projects.some((p) => p.workspaceName === invoiceMarca)
      ? invoiceMarca
      : "";
  const [workspaceFilter, setWorkspaceFilter] = useState(defaultWorkspace);
  const [projectSearch, setProjectSearch] = useState("");

  const MARCAS = ["Gigson", "Gigson Solutions", "LaTroupe", "Awesomely"] as const;
  const filteredProjects = projects.filter((p) => {
    if (workspaceFilter && workspaceFilter !== "Awesomely" && p.workspaceName !== workspaceFilter) return false;
    if (projectSearch) {
      const q = projectSearch.toLowerCase();
      return p.name.toLowerCase().includes(q) || p.key.toLowerCase().includes(q);
    }
    return true;
  });

  const isEur = line.currency === "EUR";
  const accLabel = lineAccountingLabel(line);
  const accTitle = accountingAccountTooltip(line) ?? (accLabel || undefined);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* ── Collapsed header ── */}
      <button
        onClick={onToggle}
        className="w-full text-left hover:bg-gray-50 transition-colors"
      >
        {/* Top row: icon + name + badge + chevron */}
        <div className="flex items-center gap-3 px-5 pt-4 pb-2">
          <div className="shrink-0">
            {line.classification ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : (
              <Circle className="h-5 w-5 text-gray-300" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 truncate">{line.name}</p>
            {accLabel ? (
              <p className="text-xs text-gray-500 truncate mt-0.5 font-mono" title={accTitle}>
                {accLabel}
              </p>
            ) : null}
            {line.description && (
              <p className="text-xs text-gray-400 truncate mt-0.5">{line.description}</p>
            )}
          </div>
          {line.classification && (
            <div
              className={cn(
                "shrink-0 text-xs font-medium px-2 py-1 rounded-full border",
                STATUS_COLORS[line.classification.status]
              )}
            >
              {line.classification.projectName}
            </div>
          )}
          <ChevronDown
            className={cn(
              "h-4 w-4 text-gray-400 shrink-0 transition-transform",
              isExpanded && "rotate-180"
            )}
          />
        </div>

        {/* Bottom row: financial details */}
        <div className="flex items-center gap-6 px-5 pb-3.5 text-xs text-gray-500">
          <span className="min-w-0 truncate">
            <span className="text-gray-400">Precio: </span>
            <span className="font-mono text-gray-700">
              {formatCurrency(line.unitPrice, isEur ? "EUR" : line.currency)}
            </span>
          </span>
          <span>
            <span className="text-gray-400">Uds: </span>
            <span className="font-mono text-gray-700">{line.quantity}</span>
          </span>
          <span>
            <span className="text-gray-400">Subtotal: </span>
            <span className="font-mono text-gray-700">
              {formatCurrency(line.subtotal, isEur ? "EUR" : line.currency)}
            </span>
          </span>
          <span>
            <span className="text-gray-400">Total: </span>
            <span className="font-mono font-medium text-gray-900">
              {formatCurrency(line.total, isEur ? "EUR" : line.currency)}
            </span>
          </span>
          {!isEur && (
            <span>
              <span className="text-gray-400">Total EUR: </span>
              <span className="font-mono font-medium text-gray-900">
                {formatCurrency(line.totalEur)}
              </span>
            </span>
          )}
        </div>
      </button>

      {/* ── Expanded: classification form ── */}
      {isExpanded && (
        <div className="border-t border-gray-100 px-5 py-4 bg-gray-50 space-y-4">
          {/* Suggestions */}
          {line.suggestions.length > 0 && !line.classification && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 mb-2">
                <Sparkles className="h-3.5 w-3.5" />
                Sugerencias basadas en histórico
              </div>
              <div className="flex flex-wrap gap-2">
                {line.suggestions.map((s) => (
                  <button
                    key={s.projectId}
                    onClick={() => {
                      setSelectedProject(s.projectId);
                      const ws = projects.find((p) => p.id === s.projectId)?.workspaceName ?? "";
                      setWorkspaceFilter(ws);
                    }}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors",
                      selectedProject === s.projectId
                        ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                        : "border-gray-200 bg-white text-gray-700 hover:border-indigo-300"
                    )}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: `hsl(${s.confidence * 120}, 70%, 45%)` }}
                    />
                    {s.projectName}
                    <span className="text-xs text-gray-400">{s.workspaceName}</span>
                    <span className="text-xs text-gray-400">{Math.round(s.confidence * 100)}%</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Marca filter + project selector */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-gray-600">Marca</label>

            {/* Marca filter chips */}
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setWorkspaceFilter("")}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium border transition-colors",
                  workspaceFilter === ""
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white text-gray-600 border-gray-300 hover:border-indigo-300"
                )}
              >
                Todas
              </button>
              {MARCAS.map((marca) => (
                <button
                  key={marca}
                  type="button"
                  onClick={() => setWorkspaceFilter(marca)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium border transition-colors",
                    workspaceFilter === marca
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white text-gray-600 border-gray-300 hover:border-indigo-300"
                  )}
                >
                  {marca}
                </button>
              ))}
            </div>

            {workspaceFilter === "Awesomely" && (
              <p className="text-xs text-gray-400 italic">
                Awesomely no tiene workspace de Jira.
              </p>
            )}
            <input
              type="text"
              value={projectSearch}
              onChange={(e) => setProjectSearch(e.target.value)}
              placeholder="Buscar proyecto…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
              disabled={isPending}
            />
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
              disabled={isPending}
              size={Math.min(filteredProjects.length + 1, 7)}
            >
              <option value="">Selecciona un proyecto</option>
              {filteredProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  [{p.key}] {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Notes — hidden by default */}
          {notesOpen ? (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onBlur={(e) => {
                    if (!line.classification) onSaveDraftNote(e.target.value);
                  }}
                  placeholder="Añade una nota..."
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
                  disabled={isPending}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => { setNotes(""); setNotesOpen(false); }}
                  className="text-xs text-gray-400 hover:text-gray-600 px-2"
                >
                  Ocultar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setNotesOpen(true)}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              {notes ? `Nota: "${notes.slice(0, 40)}${notes.length > 40 ? "…" : ""}"` : "Añadir nota"}
            </button>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => onClassify(selectedProject, notes)}
              disabled={!selectedProject || isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {line.classification ? "Actualizar clasificación" : "Clasificar línea"}
            </button>

          </div>
        </div>
      )}
    </div>
  );
}
