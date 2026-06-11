"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, formatDate, holdedEstimateUrl } from "@/lib/utils";
import {
  BudgetType,
  BudgetRegion,
  BudgetStatus,
  BudgetTemplate,
  PaymentTermValueType,
} from "@prisma/client";
import { ArrowLeft, Plus, Trash2, Pencil, ExternalLink, Settings } from "lucide-react";
import {
  upsertBudgetLine,
  deleteBudgetLine,
  upsertPaymentTerm,
  deletePaymentTerm,
  createHoldedQuote,
  updateBudget,
  deleteBudget,
} from "../actions";

type Role = { id: string; name: string };

type BudgetLineData = {
  id: string;
  phase: string;
  task: string;
  roleId: string | null;
  role: Role | null;
  estimatedHours: number;
  pvpPerHour: unknown;
  costPerHour: unknown;
  sortOrder: number;
};

type PaymentTermData = {
  id: string;
  order: number;
  valueType: PaymentTermValueType;
  value: unknown;
  dueDate: Date | null;
  description: string | null;
  proformaId: string | null;
  proforma: { id: string; number: string | null; holdedId: string } | null;
};

type BudgetData = {
  id: string;
  name: string;
  type: BudgetType;
  region: BudgetRegion;
  status: BudgetStatus;
  template: BudgetTemplate;
  amount: unknown;
  currency: string;
  estimatedHours: number | null;
  monthlyFee: unknown | null;
  startDate: Date | null;
  endDate: Date | null;
  notes: string | null;
  holdedDocId: string | null;
  clientName: string | null;
  project: { id: string; name: string; jiraKey: string };
  company: { id: string; name: string } | null;
  lines: BudgetLineData[];
  paymentTerms: PaymentTermData[];
};

type Company = { id: string; name: string };

const TYPE_LABELS: Record<BudgetType, string> = {
  PRECIO_CERRADO: "Precio Cerrado",
  BOLSA_DE_HORAS: "Bolsa de Horas",
  FEE_REGULAR: "Fee Regular",
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

function LineForm({
  budgetId,
  roles,
  existing,
  onDone,
}: {
  budgetId: string;
  roles: Role[];
  existing?: BudgetLineData;
  onDone: () => void;
}): React.JSX.Element {
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await upsertBudgetLine({
        id: existing?.id,
        budgetId,
        phase: fd.get("phase") as string,
        task: fd.get("task") as string,
        roleId: (fd.get("roleId") as string) || null,
        estimatedHours: parseFloat(fd.get("estimatedHours") as string),
        pvpPerHour: parseFloat(fd.get("pvpPerHour") as string),
        costPerHour: parseFloat(fd.get("costPerHour") as string),
        sortOrder: existing?.sortOrder ?? 0,
      });
      onDone();
    });
  }

  return (
    <tr className="bg-indigo-50">
      <td colSpan={7} className="px-4 py-3">
        <form onSubmit={handleSubmit} className="flex flex-wrap gap-2 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">Fase</label>
            <input
              name="phase"
              defaultValue={existing?.phase}
              required
              placeholder="ej: Habitaciones"
              className="rounded border border-gray-300 px-2 py-1 text-xs w-28"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">Tarea</label>
            <input
              name="task"
              defaultValue={existing?.task}
              required
              placeholder="ej: Renders 3D"
              className="rounded border border-gray-300 px-2 py-1 text-xs w-36"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">Rol</label>
            <select
              name="roleId"
              defaultValue={existing?.roleId ?? ""}
              className="rounded border border-gray-300 px-2 py-1 text-xs w-32"
            >
              <option value="">Sin rol</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">Horas</label>
            <input
              name="estimatedHours"
              type="number"
              step="0.5"
              min="0"
              defaultValue={existing?.estimatedHours}
              required
              className="rounded border border-gray-300 px-2 py-1 text-xs w-16"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">PVP/h</label>
            <input
              name="pvpPerHour"
              type="number"
              step="0.01"
              min="0"
              defaultValue={existing ? Number(existing.pvpPerHour) : undefined}
              required
              className="rounded border border-gray-300 px-2 py-1 text-xs w-20"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">Coste/h</label>
            <input
              name="costPerHour"
              type="number"
              step="0.01"
              min="0"
              defaultValue={existing ? Number(existing.costPerHour) : undefined}
              required
              className="rounded border border-gray-300 px-2 py-1 text-xs w-20"
            />
          </div>
          <div className="flex gap-1">
            <button
              type="submit"
              disabled={pending}
              className="px-3 py-1 text-xs font-medium bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
            >
              {pending ? "…" : existing ? "Guardar" : "Añadir"}
            </button>
            <button
              type="button"
              onClick={onDone}
              className="px-3 py-1 text-xs text-gray-600 hover:text-gray-900 rounded hover:bg-gray-100"
            >
              Cancelar
            </button>
          </div>
        </form>
      </td>
    </tr>
  );
}

function PaymentTermForm({
  budgetId,
  amount,
  existing,
  onDone,
}: {
  budgetId: string;
  amount: number;
  existing?: PaymentTermData;
  onDone: () => void;
}): React.JSX.Element {
  const [pending, startTransition] = useTransition();
  const nextOrder = existing?.order ?? 1;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await upsertPaymentTerm({
        id: existing?.id,
        budgetId,
        order: parseInt(fd.get("order") as string),
        valueType: fd.get("valueType") as PaymentTermValueType,
        value: parseFloat(fd.get("value") as string),
        dueDate: (fd.get("dueDate") as string) || null,
        description: (fd.get("description") as string) || null,
      });
      onDone();
    });
  }

  return (
    <tr className="bg-indigo-50">
      <td colSpan={5} className="px-4 py-3">
        <form onSubmit={handleSubmit} className="flex flex-wrap gap-2 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">Tramo</label>
            <input
              name="order"
              type="number"
              min="1"
              defaultValue={nextOrder}
              required
              className="rounded border border-gray-300 px-2 py-1 text-xs w-14"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">Tipo</label>
            <select
              name="valueType"
              defaultValue={existing?.valueType ?? "PERCENTAGE"}
              className="rounded border border-gray-300 px-2 py-1 text-xs"
            >
              <option value="PERCENTAGE">%</option>
              <option value="AMOUNT">Importe fijo</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">Valor</label>
            <input
              name="value"
              type="number"
              step="0.01"
              min="0"
              defaultValue={existing ? Number(existing.value) : undefined}
              required
              placeholder="ej: 30"
              className="rounded border border-gray-300 px-2 py-1 text-xs w-20"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">Fecha emisión</label>
            <input
              name="dueDate"
              type="date"
              defaultValue={existing?.dueDate ? existing.dueDate.toISOString().split("T")[0] : undefined}
              className="rounded border border-gray-300 px-2 py-1 text-xs"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">Descripción</label>
            <input
              name="description"
              defaultValue={existing?.description ?? undefined}
              placeholder="ej: A la aceptación"
              className="rounded border border-gray-300 px-2 py-1 text-xs w-36"
            />
          </div>
          <div className="flex gap-1">
            <button
              type="submit"
              disabled={pending}
              className="px-3 py-1 text-xs font-medium bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
            >
              {pending ? "…" : existing ? "Guardar" : "Añadir"}
            </button>
            <button
              type="button"
              onClick={onDone}
              className="px-3 py-1 text-xs text-gray-600 hover:text-gray-900 rounded hover:bg-gray-100"
            >
              Cancelar
            </button>
          </div>
        </form>
      </td>
    </tr>
  );
}

const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "SEK", "NOK", "DKK"];

function BudgetSettingsModal({
  budget,
  companies,
  onClose,
  onDeleted,
}: {
  budget: BudgetData;
  companies: Company[];
  onClose: () => void;
  onDeleted: () => void;
}): React.JSX.Element {
  const [saving, startSave] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startSave(async () => {
      await updateBudget({
        id: budget.id,
        name: fd.get("name") as string,
        type: fd.get("type") as BudgetType,
        region: fd.get("region") as BudgetRegion,
        amount: parseFloat(fd.get("amount") as string) || 0,
        currency: fd.get("currency") as string,
        estimatedHours: fd.get("estimatedHours") ? parseFloat(fd.get("estimatedHours") as string) : null,
        monthlyFee: fd.get("monthlyFee") ? parseFloat(fd.get("monthlyFee") as string) : null,
        startDate: (fd.get("startDate") as string) || null,
        endDate: (fd.get("endDate") as string) || null,
        notes: (fd.get("notes") as string) || null,
        companyId: (fd.get("companyId") as string) || null,
        clientName: (fd.get("clientName") as string) || null,
      });
      onClose();
    });
  }

  function handleDelete(): void {
    startDelete(async () => {
      await deleteBudget(budget.id);
      onDeleted();
    });
  }

  const toInputDate = (d: Date | null): string =>
    d ? new Date(d).toISOString().slice(0, 10) : "";

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/30"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-md h-full overflow-y-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Ajustes del presupuesto</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Nombre</label>
                <input
                  name="name"
                  required
                  defaultValue={budget.name}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Cliente</label>
                <input
                  name="clientName"
                  defaultValue={budget.clientName ?? ""}
                  placeholder="Nombre del cliente en Holded"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Entidad legal</label>
                <select
                  name="companyId"
                  defaultValue={budget.company?.id ?? ""}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Sin entidad asignada</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
                <select
                  name="type"
                  defaultValue={budget.type}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="PRECIO_CERRADO">Precio Cerrado</option>
                  <option value="BOLSA_DE_HORAS">Bolsa de Horas</option>
                  <option value="FEE_REGULAR">Fee Regular</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Región</label>
                <select
                  name="region"
                  defaultValue={budget.region}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="EU">EU</option>
                  <option value="UK">UK</option>
                  <option value="US">US</option>
                  <option value="OTHER">Otro</option>
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
                  defaultValue={Number(budget.amount)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Divisa</label>
                <select
                  name="currency"
                  defaultValue={budget.currency}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Horas estimadas</label>
                <input
                  name="estimatedHours"
                  type="number"
                  step="0.5"
                  min="0"
                  defaultValue={budget.estimatedHours ?? ""}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fee mensual</label>
                <input
                  name="monthlyFee"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={budget.monthlyFee != null ? Number(budget.monthlyFee) : ""}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fecha inicio</label>
                <input
                  name="startDate"
                  type="date"
                  defaultValue={toInputDate(budget.startDate)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fecha fin</label>
                <input
                  name="endDate"
                  type="date"
                  defaultValue={toInputDate(budget.endDate)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Notas internas</label>
                <textarea
                  name="notes"
                  rows={2}
                  defaultValue={budget.notes ?? ""}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {saving ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </form>

          {/* Danger zone */}
          <div className="border-t border-gray-200 pt-4 space-y-3">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Zona de peligro</p>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-full px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
              >
                Eliminar presupuesto
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-gray-500">¿Seguro? Esta acción no se puede deshacer.</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex-1 px-3 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                  >
                    {deleting ? "Eliminando…" : "Sí, eliminar"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function BudgetDetail({
  budget,
  roles,
  companies = [],
}: {
  budget: BudgetData;
  roles: Role[];
  companies?: Company[];
}): React.JSX.Element {
  const router = useRouter();
  const [addingLine, setAddingLine] = useState(false);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [addingTerm, setAddingTerm] = useState(false);
  const [editingTermId, setEditingTermId] = useState<string | null>(null);
  const [deletingLineId, startLineDelete] = useTransition();
  const [deletingTermId, startTermDelete] = useTransition();
  const [creatingHolded, startHoldedCreate] = useTransition();
  const [holdedError, setHoldedError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const totalPvp = budget.lines.reduce(
    (sum, l) => sum + l.estimatedHours * Number(l.pvpPerHour),
    0
  );
  const totalCost = budget.lines.reduce(
    (sum, l) => sum + l.estimatedHours * Number(l.costPerHour),
    0
  );
  const totalHours = budget.lines.reduce((sum, l) => sum + l.estimatedHours, 0);
  const grossMargin = totalPvp > 0 ? ((totalPvp - totalCost) / totalPvp) * 100 : null;

  const budgetAmount = Number(budget.amount);
  const totalTermsValue = budget.paymentTerms.reduce((sum, t) => {
    if (t.valueType === "PERCENTAGE") return sum + (budgetAmount * Number(t.value)) / 100;
    return sum + Number(t.value);
  }, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/budgets")}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 truncate flex items-center gap-2">
            {budget.name}
            {budget.holdedDocId && (
              <a
                href={holdedEstimateUrl(budget.holdedDocId)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-base text-gray-400 hover:text-indigo-600 transition-colors flex-shrink-0"
                title="Ver presupuesto en Holded"
              >
                ↗
              </a>
            )}
          </h1>
          <p className="text-sm text-gray-500">
            <span className="font-mono text-gray-400">{budget.project.jiraKey}</span>
            {" "}·{" "}{budget.project.name}
            {budget.company && (
              <span className="ml-2 text-xs text-gray-400">· {budget.company.name}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_COLORS[budget.status]}`}>
            {STATUS_LABELS[budget.status]}
          </span>
          {!budget.holdedDocId && (
            <div className="flex flex-col items-end gap-1">
              <button
                onClick={() => {
                  setHoldedError(null);
                  startHoldedCreate(async () => {
                    const res = await createHoldedQuote(budget.id);
                    if (res.error) setHoldedError(res.error);
                  });
                }}
                disabled={creatingHolded || !budget.company}
                title={!budget.company ? "Asigna una entidad legal al presupuesto" : "Crear presupuesto en Holded"}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {creatingHolded ? "Creando…" : "Crear en Holded"}
              </button>
              {holdedError && (
                <p className="text-xs text-red-500 max-w-xs text-right">{holdedError}</p>
              )}
            </div>
          )}
          {budget.holdedDocId && (
            <a
              href={holdedEstimateUrl(budget.holdedDocId)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Ver en Holded
            </a>
          )}
          <button
            onClick={() => setShowSettings(true)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            title="Ajustes del presupuesto"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      {showSettings && (
        <BudgetSettingsModal
          budget={budget}
          companies={companies}
          onClose={() => setShowSettings(false)}
          onDeleted={() => router.push("/budgets")}
        />
      )}

      {/* Meta info */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Tipo</p>
          <p className="text-sm font-medium text-gray-900">{TYPE_LABELS[budget.type]}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Región</p>
          <p className="text-sm font-medium text-gray-900">{REGION_LABELS[budget.region]}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Importe acordado</p>
          <p className="text-sm font-semibold text-gray-900">{formatCurrency(budgetAmount, budget.currency)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Template</p>
          <p className="text-sm font-medium text-gray-900">{budget.template}</p>
        </div>
      </div>

      {/* KPI summary */}
      {budget.lines.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">Total horas</p>
            <p className="text-sm font-semibold text-gray-900">{totalHours.toLocaleString("es-ES")} h</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">PVP total estimado</p>
            <p className="text-sm font-semibold text-gray-900">{formatCurrency(totalPvp)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">Coste total estimado</p>
            <p className="text-sm font-semibold text-gray-900">{formatCurrency(totalCost)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">Margen bruto estimado</p>
            {grossMargin !== null ? (
              <p className={`text-sm font-semibold ${grossMargin >= 30 ? "text-green-600" : grossMargin >= 15 ? "text-yellow-600" : "text-red-600"}`}>
                {grossMargin.toFixed(1)}%
              </p>
            ) : (
              <p className="text-sm text-gray-300">—</p>
            )}
          </div>
        </div>
      )}

      {/* Budget lines */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Desglose interno</h2>
          <button
            onClick={() => { setAddingLine(true); setEditingLineId(null); }}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Añadir línea
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs">
                <th className="px-4 py-2 text-left font-medium text-gray-600">Fase</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">Tarea</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">Rol</th>
                <th className="px-4 py-2 text-right font-medium text-gray-600 whitespace-nowrap">Horas</th>
                <th className="px-4 py-2 text-right font-medium text-gray-600 whitespace-nowrap">PVP/h</th>
                <th className="px-4 py-2 text-right font-medium text-gray-600 whitespace-nowrap">Total PVP</th>
                <th className="px-4 py-2 text-right font-medium text-gray-600 whitespace-nowrap">Margen</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {budget.lines.map((line) =>
                editingLineId === line.id ? (
                  <LineForm
                    key={`edit-${line.id}`}
                    budgetId={budget.id}
                    roles={roles}
                    existing={line}
                    onDone={() => setEditingLineId(null)}
                  />
                ) : (
                  <tr key={line.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-600 text-xs">{line.phase}</td>
                    <td className="px-4 py-2.5 text-gray-900 text-xs">{line.task}</td>
                    <td className="px-4 py-2.5 text-xs">
                      {line.role ? (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 bg-gray-100 text-gray-600">
                          {line.role.name}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-600 text-xs">
                      {line.estimatedHours.toLocaleString("es-ES")} h
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-600 text-xs">
                      {formatCurrency(Number(line.pvpPerHour))}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium text-gray-900 text-xs">
                      {formatCurrency(line.estimatedHours * Number(line.pvpPerHour))}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs">
                      {(() => {
                        const pvp = line.estimatedHours * Number(line.pvpPerHour);
                        const cost = line.estimatedHours * Number(line.costPerHour);
                        const m = pvp > 0 ? ((pvp - cost) / pvp) * 100 : null;
                        if (m === null) return <span className="text-gray-300">—</span>;
                        return (
                          <span className={m >= 30 ? "text-green-600" : m >= 15 ? "text-yellow-600" : "text-red-600"}>
                            {m.toFixed(0)}%
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => setEditingLineId(line.id)}
                          className="p-1 text-gray-400 hover:text-indigo-600 rounded transition-colors"
                          title="Editar"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => startLineDelete(async () => {
                            await deleteBudgetLine(line.id, budget.id);
                          })}
                          className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              )}
              {addingLine && (
                <LineForm
                  budgetId={budget.id}
                  roles={roles}
                  onDone={() => setAddingLine(false)}
                />
              )}
              {budget.lines.length === 0 && !addingLine && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-xs text-gray-400">
                    Sin líneas todavía. Añade fases y tareas para calcular el margen.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment terms */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-900">Condiciones de pago</h2>
            {budget.paymentTerms.length > 0 && (
              <span className={`text-xs ${Math.abs(totalTermsValue - budgetAmount) < 1 ? "text-green-600" : "text-yellow-600"}`}>
                {formatCurrency(totalTermsValue)} de {formatCurrency(budgetAmount)}
              </span>
            )}
          </div>
          <button
            onClick={() => { setAddingTerm(true); setEditingTermId(null); }}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Añadir tramo
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs">
                <th className="px-4 py-2 text-center font-medium text-gray-600">Tramo</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">Descripción</th>
                <th className="px-4 py-2 text-right font-medium text-gray-600">Valor</th>
                <th className="px-4 py-2 text-right font-medium text-gray-600 whitespace-nowrap">Importe</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600 whitespace-nowrap">Fecha emisión</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">Proforma</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {budget.paymentTerms.map((term) =>
                editingTermId === term.id ? (
                  <PaymentTermForm
                    key={`edit-${term.id}`}
                    budgetId={budget.id}
                    amount={budgetAmount}
                    existing={term}
                    onDone={() => setEditingTermId(null)}
                  />
                ) : (
                  <tr key={term.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-center text-xs text-gray-600">{term.order}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-600">
                      {term.description ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-gray-600">
                      {term.valueType === "PERCENTAGE"
                        ? `${Number(term.value).toLocaleString("es-ES")}%`
                        : formatCurrency(Number(term.value))}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium text-xs text-gray-900">
                      {term.valueType === "PERCENTAGE"
                        ? formatCurrency((budgetAmount * Number(term.value)) / 100)
                        : formatCurrency(Number(term.value))}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-600 whitespace-nowrap">
                      {term.dueDate ? (
                        <span className={new Date(term.dueDate) < new Date() && !term.proforma ? "text-red-600 font-medium" : ""}>
                          {formatDate(term.dueDate.toISOString())}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {term.proforma ? (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 bg-green-100 text-green-700">
                          {term.proforma.number ?? "Borrador"}
                        </span>
                      ) : (
                        <span className="text-gray-300">Sin vincular</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => setEditingTermId(term.id)}
                          className="p-1 text-gray-400 hover:text-indigo-600 rounded transition-colors"
                          title="Editar"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => startTermDelete(async () => {
                            await deletePaymentTerm(term.id, budget.id);
                          })}
                          className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              )}
              {addingTerm && (
                <PaymentTermForm
                  budgetId={budget.id}
                  amount={budgetAmount}
                  onDone={() => setAddingTerm(false)}
                />
              )}
              {budget.paymentTerms.length === 0 && !addingTerm && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-xs text-gray-400">
                    Sin condiciones de pago. Añade tramos (ej: 30% a la aceptación).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {budget.notes && (
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
          <p className="text-xs font-medium text-amber-700 mb-1">Notas internas</p>
          <p className="text-sm text-amber-900 whitespace-pre-wrap">{budget.notes}</p>
        </div>
      )}
    </div>
  );
}
