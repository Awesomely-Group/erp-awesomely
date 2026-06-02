"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatCurrency, formatDate, holdedInvoiceUrl } from "@/lib/utils";
import { MARCA_OPTIONS } from "@/lib/org";
import { bulkUpdateInvoiceMarca, bulkUpdateInvoiceProject } from "./[id]/actions";

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
  APPROVED: "Aprobado",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-red-100 text-red-700",
  PARTIAL: "bg-amber-100 text-amber-700",
  CLASSIFIED: "bg-blue-100 text-blue-700",
  APPROVED: "bg-green-100 text-green-700",
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
  total: number;
  totalEur: number;
  holdedStatus: number | null;
  status: string;
  companyName: string;
  brand: string | null;
}

interface Props {
  invoices: InvoiceRow[];
  selectedId?: string;
  projects: { id: string; name: string; workspaceName: string }[];
}

export function InvoicesTable({ invoices, selectedId, projects }: Props): React.JSX.Element {
  const router = useRouter();
  const sp = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMarca, setBulkMarca] = useState<string>("");
  const [bulkProjectId, setBulkProjectId] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const allSelected = invoices.length > 0 && selected.size === invoices.length;
  const someSelected = selected.size > 0 && !allSelected;

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

  if (invoices.length === 0) {
    return (
      <tr>
        <td colSpan={12} className="px-4 py-12 text-center text-gray-400">
          No hay facturas con estos filtros
        </td>
      </tr>
    );
  }

  return (
    <>
      {selected.size > 0 && (
        <tr className="bg-indigo-50 border-b border-indigo-100">
          <td colSpan={12} className="px-4 py-2">
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
        <td colSpan={11} />
      </tr>
      {invoices.map((inv) => {
        const isSelected = inv.id === selectedId;
        const isChecked = selected.has(inv.id);
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
              isSelected ? "bg-indigo-50 hover:bg-indigo-100" : isChecked ? "bg-indigo-50/50" : "hover:bg-gray-50"
            }`}
          >
            <td className="w-8 px-4 py-3" onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => toggleOne(inv.id)}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
            </td>
            <td className="px-4 py-3">
              <div className="flex items-center gap-2">
                <span className={`font-medium ${isSelected ? "text-indigo-700" : "text-gray-900"}`}>
                  {inv.number ?? <span className="italic text-gray-400 font-normal">Borrador</span>}
                </span>
                <a
                  href={holdedInvoiceUrl(inv.holdedId, inv.type)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-gray-400 hover:text-indigo-600 transition-colors"
                  title="Ver en Holded"
                >
                  ↗
                </a>
              </div>
            </td>
            <td className="px-4 py-3 text-gray-600">{inv.companyName}</td>
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
            <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">
              {inv.counterparty ?? "—"}
            </td>
            <td className="px-4 py-3 text-gray-600 capitalize">{formatMonth(inv.accountingMonth)}</td>
            <td className="px-4 py-3 text-gray-600">{formatDate(inv.date)}</td>
            <td className="px-4 py-3 text-right text-gray-600">
              {formatCurrency(inv.subtotal, inv.currency)}
            </td>
            <td className="px-4 py-3 text-right text-gray-600">
              {formatCurrency(inv.total, inv.currency)}
            </td>
            <td className="px-4 py-3 text-right font-medium">
              {formatCurrency(inv.totalEur)}
            </td>
            <td className="px-4 py-3">
              {inv.holdedStatus != null && (
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${HOLDED_STATUS_COLORS[inv.holdedStatus] ?? ""}`}>
                  {HOLDED_STATUS_LABELS[inv.holdedStatus] ?? String(inv.holdedStatus)}
                </span>
              )}
            </td>
            <td className="px-4 py-3">
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[inv.status] ?? ""}`}
              >
                {STATUS_LABELS[inv.status] ?? inv.status}
              </span>
            </td>
          </tr>
        );
      })}
    </>
  );
}
