"use client";

import { useState, useRef, useTransition, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/utils";
import { BudgetType, BudgetRegion, BudgetStatus, BudgetTemplate } from "@prisma/client";
import { Plus, ChevronDown } from "lucide-react";
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

const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "SEK", "NOK", "DKK"];

type Project = { id: string; name: string; jiraKey: string };
export type Workspace = { id: string | null; name: string; projects: Project[] };
export type Company = { id: string; name: string };

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

type HoldedContact = { id: string; name: string };

function ContactCombobox({
  companyId,
  selected,
  onSelect,
}: {
  companyId: string | null;
  selected: HoldedContact | null;
  onSelect: (c: HoldedContact | null) => void;
}): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<HoldedContact[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const search = useCallback(
    async (q: string) => {
      if (!companyId) { setResults([]); return; }
      setLoading(true);
      try {
        const params = new URLSearchParams({ companyId, q });
        const res = await fetch(`/api/holded/contacts?${params}`);
        const data: HoldedContact[] = await res.json();
        setResults(data.slice(0, 50));
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [companyId]
  );

  useEffect(() => {
    if (selected) return;
    const timer = setTimeout(() => { void search(query); }, 300);
    return () => clearTimeout(timer);
  }, [query, search, selected]);

  // Reset when company changes
  useEffect(() => {
    onSelect(null);
    setQuery("");
    setResults([]);
  }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function handleClick(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>): void {
    onSelect(null);
    setQuery(e.target.value);
  }

  function handleInputFocus(): void {
    if (!companyId) return;
    if (results.length === 0 && !query) void search("");
    setOpen(true);
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        value={selected ? selected.name : query}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        disabled={!companyId}
        placeholder={companyId ? "Busca un contacto de Holded…" : "Selecciona empresa primero"}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
      />
      {loading && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">…</span>
      )}
      {open && results.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => { onSelect(c); setOpen(false); setQuery(""); }}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-indigo-50 transition-colors"
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      {open && !loading && results.length === 0 && query && (
        <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-lg shadow-sm px-3 py-2 text-xs text-gray-400">
          Sin resultados
        </div>
      )}
    </div>
  );
}

function NewBudgetModal({
  workspace,
  companies,
  onClose,
}: {
  workspace: Workspace;
  companies: Company[];
  onClose: () => void;
}): React.JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [selectedContact, setSelectedContact] = useState<HoldedContact | null>(null);

  const template: BudgetTemplate = workspace.name.toLowerCase().includes("troupe") ? "TROUPE" : "SOLUTIONS";

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
        template,
        startDate: (fd.get("startDate") as string) || null,
        endDate: (fd.get("endDate") as string) || null,
        notes: (fd.get("notes") as string) || null,
        companyId: selectedCompanyId,
        clientName: selectedContact?.name ?? null,
        holdedContactId: selectedContact?.id ?? null,
      });
      onClose();
      router.push(`/budgets/${id}`);
    });
  }

  const hasProjects = workspace.projects.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-900">
          Nuevo presupuesto
          <span className="text-gray-400 font-normal"> — {workspace.name}</span>
        </h2>
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
              {hasProjects ? (
                <select
                  name="projectId"
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Selecciona proyecto…</option>
                  {workspace.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.jiraKey}] {p.name}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-gray-400 italic py-2">
                  Este workspace aún no tiene proyectos de Jira configurados.
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Entidad legal</label>
              <select
                value={selectedCompanyId ?? ""}
                onChange={(e) => setSelectedCompanyId(e.target.value || null)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Sin entidad asignada</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cliente</label>
              <ContactCombobox
                companyId={selectedCompanyId}
                selected={selectedContact}
                onSelect={setSelectedContact}
              />
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
              <select
                name="currency"
                defaultValue="EUR"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
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
              disabled={pending || !hasProjects}
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
  workspaces = [],
  companies = [],
}: {
  rows: BudgetRow[];
  workspaces?: Workspace[];
  companies?: Company[];
}): React.JSX.Element {
  const router = useRouter();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Presupuestos</h1>
          <p className="text-sm text-gray-500 mt-1">Gestión de presupuestos por proyecto</p>
        </div>
        <div
          ref={dropdownRef}
          className="relative"
          onMouseEnter={() => setDropdownOpen(true)}
          onMouseLeave={() => setDropdownOpen(false)}
        >
          <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
            <Plus className="h-4 w-4" />
            Nuevo presupuesto
            <ChevronDown className="h-3.5 w-3.5 opacity-70" />
          </button>
          {dropdownOpen && workspaces.length > 0 && (
            <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
              {workspaces.map((w) => (
                <button
                  key={w.id ?? w.name}
                  onClick={() => { setSelectedWorkspace(w); setDropdownOpen(false); }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  {w.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 px-6 py-16 text-center">
          <p className="text-gray-400 text-sm">No hay presupuestos todavía.</p>
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

      {selectedWorkspace && (
        <NewBudgetModal
          workspace={selectedWorkspace}
          companies={companies}
          onClose={() => setSelectedWorkspace(null)}
        />
      )}
    </div>
  );
}
