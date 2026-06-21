"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatCurrency, formatDate, holdedInvoiceUrl } from "@/lib/utils";
import { MARCA_OPTIONS } from "@/lib/org";
import { bulkUpdateInvoiceMarca, bulkUpdateInvoiceProject, bulkIgnoreInvoiceProject } from "./[id]/actions";
import { OPTIONAL_COLUMNS, type ColumnKey } from "./columns";

function formatMonth(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("es-ES", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Sin clasificar",
  PARTIAL: "Parcial",
  CLASSIFIED: "Clasificado",
  SIN_MARCA: "Sin Marca",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-red-100 text-red-700",
  PARTIAL: "bg-amber-100 text-amber-700",
  CLASSIFIED: "bg-blue-100 text-blue-700",
  SIN_MARCA: "bg-orange-100 text-orange-700",
};

const HOLDED_STATUS_LABELS: Record<number, string> = {
  [-1]: "Cancelada",
  0: "Borrador",
  1: "Pendiente",
  2: "Pagada",
  3: "Vencida",
};

const HOLDED_STATUS_COLORS: Record<number, string> = {
  [-1]: "bg-gray-100 text-gray-500",
  0: "bg-gray-100 text-gray-500",
  1: "bg-amber-100 text-amber-700",
  2: "bg-green-100 text-green-700",
  3: "bg-red-100 text-red-700",
};

const RECURRENCE_LABELS: Record<string, string> = {
  PUNTUAL:        "Puntual",
  MENSUAL:        "Mensual",
  ANUAL:          "Anual",
  EXTRAORDINARIO: "Extraordinario",
};

const RECURRENCE_COLORS: Record<string, string> = {
  PUNTUAL:        "bg-blue-100 text-blue-700",
  MENSUAL:        "bg-green-100 text-green-700",
  ANUAL:          "bg-purple-100 text-purple-700",
  EXTRAORDINARIO: "bg-amber-100 text-amber-700",
};

interface InvoiceRow {
  id: string;
  holdedId: string;
  type: "SALE" | "PURCHASE";
  number: string | null;
  counterparty: string | null;
  date: string;
  accountingMonth: string;
  currency: string;
  subtotal: number;
  subtotalEur: number;
  total: number;
  totalEur: number;
  holdedStatus: number | null;
  status: string;
  companyName: string;
  brand: string | null;
  recurrence: string | null;
  removedFromHoldedAt: string | null;
}

interface Props {
  invoices: InvoiceRow[];
  selectedId?: string;
  projects: { id: string; name: string; workspaceName: string }[];
  visibleCols: Set<ColumnKey>;
  invoiceType: "SALE" | "PURCHASE";
}

export function InvoicesTable({ invoices, selectedId, projects, visibleCols, invoiceType }: Props): React.JSX.Element {
  const router = useRouter();
  const sp = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMarca, setBulkMarca] = useState<string>("");
  const [bulkProjectId, setBulkProjectId] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const allSelected = invoices.length > 0 && selected.size === invoices.length;
  const someSelected = selected.size > 0 && !allSelected;

  // Total columns: checkbox(1) + Número(1) + Contraparte(1) + visible optional cols
  const visibleOptionalCount = OPTIONAL_COLUMNS.filter((c) => visibleCols.has(c.key)).length;
  const totalCols = 3 + visibleOptionalCount;

  function toggleAll(): void {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(invoices.map((i) => i.id)));
    }
  }

  function toggleOne(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleBulkApply(): void {
    startTransition(async () => {
      await bulkUpdateInvoiceMarca({
        invoiceIds: [...selected],
        marca: bulkMarca || null,
      });
      setSelected(new Set());
      setBulkMarca("");
    });
  }

  function handleBulkProjectApply(): void {
    if (!bulkProjectId) return;
    startTransition(async () => {
      await bulkUpdateInvoiceProject({
        invoiceIds: [...selected],
        projectId: bulkProjectId,
      });
      setSelected(new Set());
      setBulkProjectId("");
    });
  }

  function handleBulkIgnoreProject(): void {
    startTransition(async () => {
      await bulkIgnoreInvoiceProject({ invoiceIds: [...selected] });
      setSelected(new Set());
    });
  }

  if (invoices.length === 0) {
    return (
      <tr>
        <td colSpan={totalCols} className="px-4 py-12 text-center text-gray-400">
          No hay facturas con estos filtros
        </td>
      </tr>
    );
  }

  return (
    <>
      {selected.size > 0 && (
        <tr className="bg-indigo-50 border-b border-indigo-100">
          <td colSpan={totalCols} className="px-4 py-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="text-sm font-medium text-indigo-700">
                {selected.size} {selected.size === 1 ? "seleccionada" : "seleccionadas"}
              </span>
              <div className="flex items-center gap-2">
                <select
                  value={bulkMarca}
                  onChange={(e) => setBulkMarca(e.target.value)}
                  disabled={isPending}
                  className="rounded border border-indigo-200 px-2 py-1 text-xs bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">Sin marca</option>
                  {MARCA_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <button
                  onClick={handleBulkApply}
                  disabled={isPending}
                  className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {isPending ? "Aplicando…" : "Aplicar marca"}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={bulkProjectId}
                  onChange={(e) => setBulkProjectId(e.target.value)}
                  disabled={isPending}
                  className="rounded border border-indigo-200 px-2 py-1 text-xs bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">Sin proyecto</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={handleBulkProjectApply}
                    disabled={isPending || !bulkProjectId}
                    className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {isPending ? "Aplicando…" : "Aplicar proyecto"}
                  </button>
                  <span className="text-[10px] text-indigo-400 leading-tight">
                    Se aplicará a todas las líneas de la factura
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={handleBulkIgnoreProject}
                  disabled={isPending}
                  className="rounded bg-gray-500 px-3 py-1 text-xs font-medium text-white hover:bg-gray-600 disabled:opacity-50"
                >
                  {isPending ? "Aplicando…" : "Clasificar sin proyecto"}
                </button>
                <span className="text-[10px] text-indigo-400 leading-tight">
                  Ignora la selección de proyecto
                </span>
              </div>
              <button
                onClick={() => setSelected(new Set())}
                disabled={isPending}
                className="text-xs text-indigo-500 hover:text-indigo-700 disabled:opacity-50 ml-auto"
              >
                Deseleccionar
              </button>
            </div>
          </td>
        </tr>
      )}
      <tr className="border-b border-gray-100 bg-gray-50">
        <td className="w-8 px-4 py-3">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => { if (el) el.indeterminate = someSelected; }}
            onChange={toggleAll}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
        </td>
        <td colSpan={totalCols - 1} />
      </tr>
      {invoices.map((inv) => {
        const isSelected = inv.id === selectedId;
        const isChecked = selected.has(inv.id);
        const isRemoved = inv.removedFromHoldedAt !== null;
        return (
          <tr
            key={inv.id}
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("a, button, input")) return;
              const params = new URLSearchParams(sp.toString());
              if (params.get("invoiceId") === inv.id) {
                params.delete("invoiceId");
              } else {
                params.set("invoiceId", inv.id);
              }
              router.push(`/invoices?${params.toString()}`);
            }}
            className={`cursor-pointer border-b border-gray-100 last:border-0 transition-colors ${
              isRemoved ? "opacity-60" : ""
            } ${
              isSelected ? "bg-indigo-50 hover:bg-indigo-100" : isChecked ? "bg-indigo-50/50" : "hover:bg-gray-50"
            }`}
          >
            {/* Checkbox — always visible */}
            <td className="w-8 px-4 py-3" onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => toggleOne(inv.id)}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
            </td>

            {/* Número — always visible */}
            <td className="px-4 py-3">
              <div className="flex items-center gap-2">
                <span className={`font-medium ${isSelected ? "text-indigo-700" : "text-gray-900"}`}>
                  {inv.number ?? <span className="italic text-gray-400 font-normal">Borrador</span>}
                </span>
                {isRemoved ? (
                  <span className="text-xs text-gray-300 cursor-default" title="Ya no existe en Holded">↗</span>
                ) : (
                  <a
                    href={holdedInvoiceUrl(inv.holdedId, inv.type)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-gray-400 hover:text-indigo-600 transition-colors"
                    title="Ver en Holded"
                  >
                    ↗
                  </a>
                )}
              </div>
            </td>

            {/* Entidad Legal — optional */}
            {visibleCols.has("companyName") && (
              <td className="px-4 py-3 text-gray-600">{inv.companyName}</td>
            )}

            {/* Marca — optional */}
            {visibleCols.has("brand") && (
              <td className="px-4 py-3">
                {inv.brand ? (
                  <div className="flex flex-wrap gap-1">
                    {inv.brand.split(",").map((m) => (
                      <span key={m} className="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-700 whitespace-nowrap">{m}</span>
                    ))}
                  </div>
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </td>
            )}

            {/* Contraparte — always visible */}
            <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">
              {inv.counterparty ?? "—"}
            </td>

            {/* Mes Referencia — optional */}
            {visibleCols.has("accountingMonth") && (
              <td className="px-4 py-3 text-gray-600 capitalize">{formatMonth(inv.accountingMonth)}</td>
            )}

            {/* Fecha — optional */}
            {visibleCols.has("date") && (
              <td className="px-4 py-3 text-gray-600">{formatDate(inv.date)}</td>
            )}

            {/* Base imp. — optional */}
            {visibleCols.has("subtotal") && (
              <td className="px-4 py-3 text-right text-gray-600">
                <div>{formatCurrency(inv.subtotal, inv.currency)}</div>
                {inv.currency !== "EUR" && (
                  <div className="text-xs text-gray-400">{formatCurrency(inv.subtotalEur)}</div>
                )}
              </td>
            )}

            {/* Total — optional */}
            {visibleCols.has("total") && (
              <td className="px-4 py-3 text-right text-gray-600">
                <div>{formatCurrency(inv.total, inv.currency)}</div>
                {inv.currency !== "EUR" && (
                  <div className="text-xs text-gray-400">{formatCurrency(inv.totalEur)}</div>
                )}
              </td>
            )}

            {/* Total (EUR) — optional */}
            {visibleCols.has("totalEur") && (
              <td className="px-4 py-3 text-right font-medium">
                {formatCurrency(inv.totalEur)}
              </td>
            )}

            {/* Estado Holded — optional */}
            {visibleCols.has("holdedStatus") && (
              <td className="px-4 py-3">
                {inv.holdedStatus != null && (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${HOLDED_STATUS_COLORS[inv.holdedStatus] ?? ""}`}>
                    {HOLDED_STATUS_LABELS[inv.holdedStatus] ?? String(inv.holdedStatus)}
                  </span>
                )}
              </td>
            )}

            {/* Estado — optional */}
            {visibleCols.has("status") && (
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {isRemoved && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                      Eliminada en Holded
                    </span>
                  )}
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[inv.status] ?? ""}`}>
                    {STATUS_LABELS[inv.status] ?? inv.status}
                  </span>
                </div>
              </td>
            )}

            {/* Recurrencia — solo compras */}
            {invoiceType === "PURCHASE" && visibleCols.has("recurrence") && (
              <td className="px-4 py-3">
                {inv.recurrence ? (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${RECURRENCE_COLORS[inv.recurrence] ?? ""}`}>
                    {RECURRENCE_LABELS[inv.recurrence] ?? inv.recurrence}
                  </span>
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </td>
            )}
          </tr>
        );
      })}
    </>
  );
}
