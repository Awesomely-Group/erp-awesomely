"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/utils";
import { filterProjectsByMarca } from "@/lib/org";
import { classifyLine, ignoreLine, saveDraftLineNote } from "./actions";
import { ChevronDown, Sparkles, CheckCircle, Circle, MessageSquare, MinusCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProjectCombobox } from "@/components/project-combobox";

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
  projectId: string | null;
  projectName: string | null;
  workspaceName: string | null;
  marca: string | null;
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
  IGNORED: "text-gray-400 bg-gray-50 border-gray-200",
};

const MARCAS = ["Gigson", "Gigson Solutions", "LaTroupe", "Awesomely"] as const;

export function ClassifyLinesForm({ invoiceId, invoiceMarca, lines, projects }: Props): React.JSX.Element {
  const router = useRouter();
  const [localLines, setLocalLines] = useState(lines);
  const [expandedLine, setExpandedLine] = useState<string | null>(
    lines.find((l) => !l.classification)?.id ?? null
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClassify(lineId: string, projectId: string | null, marca: string | null, notes: string): void {
    setError(null);
    startTransition(async () => {
      try {
        const { classificationId } = await classifyLine({ lineId, projectId, marca, notes, invoiceId });
        setLocalLines((prev) =>
          prev.map((l) => {
            if (l.id !== lineId) return l;
            const project = projectId ? projects.find((p) => p.id === projectId) : null;
            return {
              ...l,
              classification: {
                id: classificationId,
                status: "CLASSIFIED",
                projectId,
                projectName: project?.name ?? null,
                workspaceName: project?.workspaceName ?? null,
                marca,
                notes,
              },
            };
          })
        );
        const nextUnclassified = localLines.find((l) => l.id !== lineId && !l.classification);
        setExpandedLine(nextUnclassified?.id ?? null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al clasificar la línea");
      }
    });
  }

  function handleIgnore(lineId: string, reason: string): void {
    setError(null);
    startTransition(async () => {
      try {
        await ignoreLine({ lineId, invoiceId, reason: reason || undefined });
        setLocalLines((prev) =>
          prev.map((l) => {
            if (l.id !== lineId) return l;
            return {
              ...l,
              classification: {
                id: "",
                status: "IGNORED",
                projectId: null,
                projectName: null,
                workspaceName: null,
                marca: null,
                notes: reason || null,
              },
            };
          })
        );
        const nextUnclassified = localLines.find((l) => l.id !== lineId && !l.classification);
        setExpandedLine(nextUnclassified?.id ?? null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al ignorar la línea");
      }
    });
  }

  return (
    <div className="space-y-2">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {localLines.map((line) => (
        <LineRow
          key={line.id}
          line={line}
          projects={projects}
          invoiceMarca={invoiceMarca}
          isExpanded={expandedLine === line.id}
          isPending={isPending}
          onToggle={() => setExpandedLine(expandedLine === line.id ? null : line.id)}
          onClassify={(projectId, marca, notes) => handleClassify(line.id, projectId, marca, notes)}
          onIgnore={(reason) => handleIgnore(line.id, reason)}
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
  onIgnore,
  onSaveDraftNote,
}: {
  line: Line;
  projects: Project[];
  invoiceMarca?: string | null;
  isExpanded: boolean;
  isPending: boolean;
  onToggle: () => void;
  onClassify: (projectId: string | null, marca: string | null, notes: string) => void;
  onIgnore: (reason: string) => void;
  onSaveDraftNote: (notes: string) => void;
}): React.JSX.Element {
  const [selectedProject, setSelectedProject] = useState(line.classification?.projectId ?? "");
  const [projectChosen, setProjectChosen] = useState(!!line.classification);
  const initialNotes = line.classification?.notes ?? line.notes ?? "";
  const [notes, setNotes] = useState(initialNotes);
  const [notesOpen, setNotesOpen] = useState(!!initialNotes);

  const [selectedMarca, setSelectedMarca] = useState<string>(
    line.classification?.marca ??
    line.classification?.workspaceName ??
    (invoiceMarca && MARCAS.includes(invoiceMarca as (typeof MARCAS)[number]) ? invoiceMarca : "")
  );

  function handleProjectChange(id: string): void {
    setProjectChosen(true);
    setSelectedProject(id);
    if (id) {
      const project = projects.find((p) => p.id === id);
      if (project && MARCAS.includes(project.workspaceName as (typeof MARCAS)[number])) {
        setSelectedMarca(project.workspaceName);
      }
    }
  }

  function handleMarcaChange(newMarca: string): void {
    setSelectedMarca(newMarca);
    if (selectedProject) {
      const project = projects.find((p) => p.id === selectedProject);
      if (!project || project.workspaceName !== newMarca) {
        setSelectedProject("");
      }
    }
  }

  const classifiedLabel =
    line.classification?.projectName ??
    line.classification?.marca ??
    line.classification?.workspaceName ??
    null;

  const isEur = line.currency === "EUR";

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* ── Collapsed header ── */}
      <button
        onClick={onToggle}
        className="w-full text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3 px-5 pt-4 pb-2">
          <div className="shrink-0">
            {line.classification?.status === "IGNORED" ? (
              <MinusCircle className="h-5 w-5 text-gray-300" />
            ) : line.classification ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : (
              <Circle className="h-5 w-5 text-gray-300" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 truncate">{line.name}</p>
            {line.description && (
              <p className="text-xs text-gray-400 truncate mt-0.5">{line.description}</p>
            )}
          </div>
          {line.classification?.status === "IGNORED" ? (
            <div className="shrink-0 text-xs font-medium px-2 py-1 rounded-full border text-gray-400 bg-gray-50 border-gray-200">
              Ignorada
            </div>
          ) : line.classification && classifiedLabel ? (
            <div
              className={cn(
                "shrink-0 text-xs font-medium px-2 py-1 rounded-full border",
                STATUS_COLORS[line.classification.status]
              )}
            >
              {classifiedLabel}
            </div>
          ) : null}
          <ChevronDown
            className={cn(
              "h-4 w-4 text-gray-400 shrink-0 transition-transform",
              isExpanded && "rotate-180"
            )}
          />
        </div>

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
          {line.classification?.status === "IGNORED" ? (
            <>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <MinusCircle className="h-4 w-4 text-gray-300 shrink-0" />
                <span>Esta línea está marcada como ignorada y no se incluye en la clasificación.</span>
              </div>
              {line.classification.notes && (
                <p className="text-xs text-gray-400 italic">Motivo: {line.classification.notes}</p>
              )}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => onClassify(selectedProject || null, selectedMarca || null, notes)}
                  disabled={isPending || !selectedMarca || !projectChosen}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Clasificar igualmente
                </button>
              </div>
            </>
          ) : (
            <>
              <UnifiedClassifier
                line={line}
                projects={projects}
                selectedProject={selectedProject}
                onProjectChange={handleProjectChange}
                selectedMarca={selectedMarca}
                onMarcaChange={handleMarcaChange}
                isPending={isPending}
              />

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

              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={() => onClassify(selectedProject || null, selectedMarca || null, notes)}
                  disabled={isPending || !selectedMarca || (!line.classification && !projectChosen)}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {line.classification ? "Actualizar clasificación" : "Clasificar línea"}
                </button>
                <button
                  type="button"
                  onClick={() => onIgnore(notes)}
                  disabled={isPending}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-500 hover:border-gray-400 hover:text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Ignorar línea
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function UnifiedClassifier({
  line,
  projects,
  selectedProject,
  onProjectChange,
  selectedMarca,
  onMarcaChange,
  isPending,
}: {
  line: Line;
  projects: Project[];
  selectedProject: string;
  onProjectChange: (id: string) => void;
  selectedMarca: string;
  onMarcaChange: (marca: string) => void;
  isPending: boolean;
}): React.JSX.Element {
  const availableProjects = filterProjectsByMarca(projects, selectedMarca || null);

  return (
    <>
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
                onClick={() => onProjectChange(s.projectId)}
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

      <div className="space-y-2">
        <label className="block text-xs font-medium text-gray-600">Marca</label>
        <div className="flex flex-wrap gap-1.5">
          {MARCAS.map((marca) => (
            <button
              key={marca}
              type="button"
              disabled={isPending}
              onClick={() => onMarcaChange(marca)}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium border transition-colors",
                selectedMarca === marca
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-gray-600 border-gray-300 hover:border-indigo-300"
              )}
            >
              {marca}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <label className="block text-xs font-medium text-gray-600">Proyecto Jira <span className="text-gray-400 font-normal">(selecciona un proyecto o "Sin proyecto")</span></label>
        <ProjectCombobox
          projects={availableProjects}
          value={selectedProject}
          onChange={onProjectChange}
          disabled={isPending}
        />
      </div>
    </>
  );
}
