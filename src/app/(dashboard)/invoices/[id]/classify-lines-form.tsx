"use client";

import { useState, useTransition } from "react";
import { formatCurrency } from "@/lib/utils";
import { classifyLine, updateClassificationStatus } from "./actions";
import { ChevronDown, Sparkles, CheckCircle, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

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
  description: string | null;
  quantity: number;
  unitPrice: number;
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
  lines: Line[];
  projects: Project[];
}

const STATUS_LABELS: Record<string, string> = {
  CLASSIFIED: "Clasificado",
  REVIEWED: "Revisado",
  APPROVED: "Aprobado",
};

const STATUS_COLORS: Record<string, string> = {
  CLASSIFIED: "text-blue-600 bg-blue-50 border-blue-200",
  REVIEWED: "text-purple-600 bg-purple-50 border-purple-200",
  APPROVED: "text-green-600 bg-green-50 border-green-200",
};

export function ClassifyLinesForm({ invoiceId, lines, projects }: Props): React.JSX.Element {
  const [localLines, setLocalLines] = useState(lines);
  const [expandedLine, setExpandedLine] = useState<string | null>(
    lines.find((l) => !l.classification)?.id ?? null
  );
  const [isPending, startTransition] = useTransition();

  function handleClassify(lineId: string, projectId: string, notes: string): void {
    startTransition(async () => {
      await classifyLine({ lineId, projectId, notes, invoiceId });
      setLocalLines((prev) =>
        prev.map((l) => {
          if (l.id !== lineId) return l;
          const project = projects.find((p) => p.id === projectId);
          return {
            ...l,
            classification: {
              id: "pending",
              status: "CLASSIFIED",
              projectId,
              projectName: project?.name ?? "",
              workspaceName: project?.workspaceName ?? "",
              notes,
            },
          };
        })
      );
      // Auto-advance to next unclassified line
      const nextUnclassified = localLines.find(
        (l) => l.id !== lineId && !l.classification
      );
      setExpandedLine(nextUnclassified?.id ?? null);
    });
  }

  function handleStatusChange(classificationId: string, lineId: string, status: string): void {
    startTransition(async () => {
      await updateClassificationStatus({ classificationId, status, invoiceId });
      setLocalLines((prev) =>
        prev.map((l) =>
          l.id === lineId && l.classification
            ? { ...l, classification: { ...l.classification, status } }
            : l
        )
      );
    });
  }

  return (
    <div className="space-y-2">
      {localLines.map((line) => (
        <LineRow
          key={line.id}
          line={line}
          projects={projects}
          isExpanded={expandedLine === line.id}
          isPending={isPending}
          onToggle={() =>
            setExpandedLine(expandedLine === line.id ? null : line.id)
          }
          onClassify={(projectId, notes) => handleClassify(line.id, projectId, notes)}
          onStatusChange={(classificationId, status) =>
            handleStatusChange(classificationId, line.id, status)
          }
        />
      ))}
    </div>
  );
}

function LineRow({
  line,
  projects,
  isExpanded,
  isPending,
  onToggle,
  onClassify,
  onStatusChange,
}: {
  line: Line;
  projects: Project[];
  isExpanded: boolean;
  isPending: boolean;
  onToggle: () => void;
  onClassify: (projectId: string, notes: string) => void;
  onStatusChange: (classificationId: string, status: string) => void;
}): React.JSX.Element {
  const [selectedProject, setSelectedProject] = useState(
    line.classification?.projectId ?? ""
  );
  const [notes, setNotes] = useState(line.classification?.notes ?? "");

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="shrink-0">
          {line.classification ? (
            <CheckCircle className="h-5 w-5 text-green-500" />
          ) : (
            <Circle className="h-5 w-5 text-gray-300" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 truncate">{line.name}</p>
          {line.description && (
            <p className="text-sm text-gray-500 truncate">{line.description}</p>
          )}
        </div>

        <div className="text-right shrink-0">
          <p className="font-medium text-gray-900">
            {formatCurrency(line.totalEur)}
          </p>
          <p className="text-xs text-gray-400">
            {line.quantity} × {formatCurrency(line.unitPrice)}
          </p>
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
      </button>

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
                    onClick={() => setSelectedProject(s.projectId)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors",
                      selectedProject === s.projectId
                        ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                        : "border-gray-200 bg-white text-gray-700 hover:border-indigo-300"
                    )}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{
                        backgroundColor: `hsl(${s.confidence * 120}, 70%, 45%)`,
                      }}
                    />
                    {s.projectName}
                    <span className="text-xs text-gray-400">{s.workspaceName}</span>
                    <span className="text-xs text-gray-400">
                      {Math.round(s.confidence * 100)}%
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Project selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Proyecto Jira
              </label>
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
                disabled={isPending}
              >
                <option value="">Selecciona un proyecto</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    [{p.key}] {p.name} — {p.workspaceName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Notas (opcional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Añade una nota..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
                disabled={isPending}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => onClassify(selectedProject, notes)}
              disabled={!selectedProject || isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {line.classification ? "Actualizar clasificación" : "Clasificar línea"}
            </button>

            {/* Status transitions */}
            {line.classification && (
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-xs text-gray-500">Estado:</span>
                {line.classification.status === "CLASSIFIED" && (
                  <button
                    onClick={() =>
                      onStatusChange(line.classification!.id, "REVIEWED")
                    }
                    disabled={isPending}
                    className="rounded-lg border border-purple-300 px-3 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-50 transition-colors"
                  >
                    Marcar revisado
                  </button>
                )}
                {line.classification.status === "REVIEWED" && (
                  <button
                    onClick={() =>
                      onStatusChange(line.classification!.id, "APPROVED")
                    }
                    disabled={isPending}
                    className="rounded-lg border border-green-300 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50 transition-colors"
                  >
                    Aprobar
                  </button>
                )}
                {line.classification.status !== "CLASSIFIED" && (
                  <span
                    className={cn(
                      "text-xs font-medium px-2 py-1 rounded-full border",
                      STATUS_COLORS[line.classification.status]
                    )}
                  >
                    {STATUS_LABELS[line.classification.status]}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
