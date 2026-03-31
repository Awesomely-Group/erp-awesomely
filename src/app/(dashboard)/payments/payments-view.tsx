"use client";

import { useState, useMemo } from "react";
import { formatCurrency } from "@/lib/utils";
import { PaymentRow, type PaymentInvoice } from "./payment-row";
import { ChevronDown, ChevronUp, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BatchData {
  dateStr: string;
  label: string;
  rows: PaymentInvoice[];
}

interface Props {
  batches: BatchData[];
  noDueRows: PaymentInvoice[];
  companies: string[];
  totalRows: number;
  totalPaidRows: number;
  totalPending: number;
}

export function PaymentsView({
  batches,
  noDueRows,
  companies,
  totalRows,
  totalPaidRows,
  totalPending,
}: Props): React.JSX.Element {
  const [search, setSearch] = useState("");
  const [company, setCompany] = useState("all");
  const [status, setStatus] = useState("all");
  const [openBatches, setOpenBatches] = useState<Set<string>>(new Set());

  const hasFilters = search !== "" || company !== "all" || status !== "all";

  function toggleBatch(key: string): void {
    setOpenBatches((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function filterRows(rows: PaymentInvoice[], batchDateStr?: string): PaymentInvoice[] {
    return rows.filter((row) => {
      if (search && !row.counterparty?.toLowerCase().includes(search.toLowerCase())) return false;
      if (company !== "all" && row.companyName !== company) return false;
      if (status === "paid" && row.effectivePending > 0.005) return false;
      if (status === "pending") {
        if (row.effectivePending <= 0.005) return false;
        if (batchDateStr && new Date(batchDateStr) < new Date()) return false;
      }
      if (status === "overdue") {
        if (row.effectivePending <= 0.005) return false;
        if (!batchDateStr || new Date(batchDateStr) >= new Date()) return false;
      }
      return true;
    });
  }

  const filteredNoDue = useMemo(() => filterRows(noDueRows), [noDueRows, search, company, status]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Pagos a proveedores</h1>
        <p className="text-sm text-gray-500 mt-1">
          {totalRows} facturas de compra · {totalPaidRows} pagadas ·{" "}
          <span className="font-medium text-red-600">{formatCurrency(totalPending)} pendiente</span>
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar proveedor…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-3 py-2 rounded-lg border border-gray-300 text-sm bg-white w-52 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {companies.length > 1 && (
          <select
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">Todas las empresas</option>
            {companies.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">Todos los estados</option>
          <option value="pending">Pendiente</option>
          <option value="overdue">Vencido</option>
          <option value="paid">Pagado</option>
        </select>

        {hasFilters && (
          <button
            onClick={() => { setSearch(""); setCompany("all"); setStatus("all"); }}
            className="text-sm text-gray-500 hover:text-gray-700 px-2 py-2"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Batches */}
      {batches.map((batch) => {
        const filteredRows = filterRows(batch.rows, batch.dateStr);
        if (filteredRows.length === 0 && hasFilters) return null;

        const batchPending = filteredRows.reduce((s, r) => s + r.effectivePending, 0);
        const isOverdue = new Date(batch.dateStr) < new Date();
        const allPaid = batchPending <= 0.005;
        const isOpen = openBatches.has(batch.dateStr);

        return (
          <div key={batch.dateStr} className="space-y-1">
            <button
              onClick={() => toggleBatch(batch.dateStr)}
              className="flex items-center gap-3 w-full text-left group"
            >
              <h2 className="text-sm font-semibold text-gray-700 group-hover:text-gray-900 transition-colors">
                Pago del {batch.label}
              </h2>
              {!allPaid && isOverdue && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                  Vencido
                </span>
              )}
              {!allPaid && !isOverdue && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                  {formatCurrency(batchPending)} pendiente
                </span>
              )}
              {allPaid && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                  Pagado
                </span>
              )}
              <span className="ml-auto text-gray-400 shrink-0">
                {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </span>
            </button>

            {isOpen && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-0 bg-gray-50 border-b border-gray-100 px-4 py-2 text-xs font-medium text-gray-500">
                  <div className="w-6" />
                  <div>Proveedor / Factura</div>
                  <div className="w-28 text-right">Total</div>
                  <div className="w-28 text-right">Pendiente</div>
                  <div className="w-[110px]" />
                </div>
                {filteredRows.map((row) => (
                  <PaymentRow key={row.id} invoice={row} />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* No due date rows */}
      {(filteredNoDue.length > 0 || (!hasFilters && noDueRows.length > 0)) && (
        <div className="space-y-1">
          <button
            onClick={() => toggleBatch("no-due")}
            className="flex items-center gap-3 w-full text-left group"
          >
            <h2 className="text-sm font-semibold text-gray-700 group-hover:text-gray-900 transition-colors">
              Sin fecha de vencimiento
            </h2>
            <span className="ml-auto text-gray-400 shrink-0">
              {openBatches.has("no-due")
                ? <ChevronUp className="h-4 w-4" />
                : <ChevronDown className="h-4 w-4" />}
            </span>
          </button>

          {openBatches.has("no-due") && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {filteredNoDue.map((row) => (
                <PaymentRow key={row.id} invoice={row} />
              ))}
              {filteredNoDue.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-gray-400">
                  No hay facturas que coincidan con los filtros.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {batches.length === 0 && noDueRows.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-12 text-center text-gray-400">
          No hay facturas de compra. Sincroniza primero.
        </div>
      )}
    </div>
  );
}
