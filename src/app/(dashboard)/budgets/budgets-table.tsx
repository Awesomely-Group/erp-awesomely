"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/utils";
import { BudgetType, BudgetRegion, BudgetStatus, BudgetTemplate } from "@prisma/client";
import { Plus } from "lucide-react";
import { createBudget, updateBudgetStatus } from "./actions";

export type BudgetRow = {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  projectKey: string;
  type: BudgetType;
  region: BudgetRegion;
  status: BudgetStatus;
  template: BudgetTemplate;
  amount: number;
  currency: string;
  estimatedHours: number | null;
  monthlyFee: number | null;
  startDate: string | null;
  endDate: string | null;
  linesCount: number;
  paymentTermsCount: number;
  totalEstimatedHours: number;
  totalPvp: number;
  totalCost: number;
};

const TYPE_LABELS: Record<BudgetType, string> = {
  PRECIO_CERRADO: "Precio Cerrado",
  BOLSA_DE_HORAS: "Bolsa de Horas",
  FEE_REGULAR: "Fee Regular",
};

const TYPE_COLORS: Record<BudgetType, string> = {
  PRECIO_CERRADO: "bg-blue-100 text-blue-700",
  BOLSA_DE_HORAS: "bg-purple-100 text-purple-700",
  FEE_REGULAR: "bg-orange-100 text-orange-700",
};

const STATUS_LABELS: Record<BudgetStatus, string> = {
  DRAFT: "Borrador",
  ACTIVE: "Activo",
  COMPLETED: "Completado",
  ARCHIVED: "Archivado",
};

const STATUS_COLORS: Record<BudgetStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  ACTIVE: "bg-green-100 text-green-700",
  COMPLETED: "bg-blue-100 text-blue-700",
  ARCHIVED: "bg-gray-100 text-gray-400",
};

const REGION_LABELS: Record<BudgetRegion, string> = {
  UK: "UK",
  US: "US",
  EU: "EU",
  OTHER: "Otro",
};

const TEMPLATE_LABELS: Record<BudgetTemplate, string> = {
  SOLUTIONS: "Solutions",
  TROUPE: "Troupe",
};

type Project = { id: string; name: string; jiraKey: string };

function StatusSelect({
  budgetId,
  status,
}: {
  budgetId: string;
  status: BudgetStatus;
}): React.JSX.Element {
  const [pending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>): void {
    const next = e.target.value as BudgetStatus;
    startTransition(async () => {
      await updateBudgetStatus(budgetId, next);
    });
  }

  return (
    <select
      value={status}
      onChange={handleChange}
      disabled={pending}
      onClick={(e) => e.stopPropagation()}
      className={`text-xs rounded-full px-2 py-0.5 font-medium border-0 cursor-pointer ${STATUS_COLORS[status]}`}
    >
      {(Object.keys(STATUS_LABELS) as BudgetStatus[]).map((s) => (
        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
      ))}
    </select>
  );
}

function NewBudgetModal({
  projects,
  onClose,
}: {
  projects: Project[];
  onClose: () => void;
}): React.JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const type = fd.get("type") as BudgetType;
    startTransition(async () => {
      const { id } = await createBudget({
        projectId: fd.get("projectId") as string,
        name: fd.get("name") as string,
        type,
        region: fd.get("region") as BudgetRegion,
        amount: parseFloat(fd.get("amount") as string) || 0,
        currency: fd.get("currency") as string,
        estimatedHours:
          type !== "FEE_REGULAR" && fd.get("estimatedHours")
            ? parseFloat(fd.get("estimatedHours") as string)
            : null,
        monthlyFee:
          type === "FEE_REGULAR" && fd.get("monthlyFee")
            ? parseFloat(fd.get("monthlyFee") as string)
            : null,
        template: fd.get("template") as BudgetTemplate,
        startDate: (fd.get("startDate") as string) || null,
        endDate: (fd.get("endDate") as string) || null,
        notes: (fd.get("notes") as string) || null,
      });
      onClose();
      router.push(`/budgets/${id}`);
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-900">Nuevo presupuesto</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Nombre</label>
              <input
                name="name"
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="ej: Lotte — Habitaciones"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Proyecto</label>
              <select
                name="projectId"
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Selecciona proyecto…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    [{p.jiraKey}] {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
              <select
                name="type"
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {(Object.keys(TYPE_LABELS) as BudgetType[]).map((t) => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Región</label>
              <select
                name="region"
                defaultValue="EU"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {(Object.keys(REGION_LABELS) as BudgetRegion[]).map((r) => (
                  <option key={r} value={r}>{REGION_LABELS[r]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Importe acordado</label>
              <input
                name="amount"
                type="number"
                step="0.01"
                min="0"
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="0,00"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Divisa</label>
              <input
                name="currency"
                defaultValue="EUR"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Horas estimadas</label>
              <input
                name="estimatedHours"
                type="number"
                step="0.5"
                min="0"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="ej: 120"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fee mensual (si aplica)</label>
              <input
                name="monthlyFee"
                type="number"
                step="0.01"
                min="0"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="ej: 3500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Template</label>
              <select
                name="template"
                defaultValue="SOLUTIONS"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {(Object.keys(TEMPLATE_LABELS) as BudgetTemplate[]).map((t) => (
                  <option key={t} value={t}>{TEMPLATE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fecha inicio</label>
              <input
                name="startDate"
                type="date"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fecha fin</label>
              <input
                name="endDate"
                type="date"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Notas internas</label>
              <textarea
                name="notes"
                rows={2}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {pending ? "Creando…" : "Crear presupuesto"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function BudgetsTable({
  rows,
  projects = [],
}: {
  rows: BudgetRow[];
  projects?: Project[];
}): React.JSX.Element {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);

  const projectsForModal: Project[] = projects.length > 0
    ? projects
    : Array.from(
        new Map(rows.map((r) => [r.projectId, { id: r.projectId, name: r.projectName, jiraKey: r.projectKey }])).values()
      );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Presupuestos</h1>
          <p className="text-sm text-gray-500 mt-1">Gestión de presupuestos por proyecto</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nuevo presupuesto
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 px-6 py-16 text-center">
          <p className="text-gray-400 text-sm">No hay presupuestos todavía.</p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-4 text-sm text-indigo-600 hover:underline"
          >
            Crea el primero
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs">
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Nombre</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Proyecto</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Tipo</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Región</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Template</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 whitespace-nowrap">Importe</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 whitespace-nowrap">Margen bruto</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 whitespace-nowrap">H. estimadas</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">Líneas</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">Pagos</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const margin = row.totalPvp > 0 ? ((row.totalPvp - row.totalCost) / row.totalPvp) * 100 : null;
                  return (
                    <tr
                      key={row.id}
                      onClick={() => router.push(`/budgets/${row.id}`)}
                      className="cursor-pointer border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">{row.name}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        <span className="font-mono mr-1 text-gray-400">{row.projectKey}</span>
                        {row.projectName}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[row.type]}`}>
                          {TYPE_LABELS[row.type]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{REGION_LABELS[row.region]}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{TEMPLATE_LABELS[row.template]}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900 whitespace-nowrap">
                        {formatCurrency(row.amount, row.currency)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {margin !== null ? (
                          <span className={margin >= 30 ? "text-green-600" : margin >= 15 ? "text-yellow-600" : "text-red-600"}>
                            {margin.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">
                        {row.totalEstimatedHours > 0
                          ? `${row.totalEstimatedHours.toLocaleString("es-ES")} h`
                          : row.estimatedHours
                          ? `${row.estimatedHours.toLocaleString("es-ES")} h`
                          : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-500">{row.linesCount}</td>
                      <td className="px-4 py-3 text-center text-gray-500">{row.paymentTermsCount}</td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <StatusSelect budgetId={row.id} status={row.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && (
        <NewBudgetModal
          projects={projectsForModal}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
