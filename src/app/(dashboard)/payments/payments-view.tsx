"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatCurrency, formatDate, holdedInvoiceUrl } from "@/lib/utils";

export interface PendingInvoice {
  id: string;
  holdedId: string;
  type: "PURCHASE" | "SALE";
  number: string | null;
  counterparty: string | null;
  dueDate: string | null;
  totalEur: number;
  effectivePending: number;
  companyName: string;
}

interface Props {
  pendingPayments: PendingInvoice[];
  pendingCollections: PendingInvoice[];
  companies: string[];
}

export function PaymentsView({
  pendingPayments,
  pendingCollections,
  companies,
}: Props): React.JSX.Element {
  const [company, setCompany] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const hasFilters = company !== "all" || fromDate !== "" || toDate !== "";

  function inDateRange(dueDate: string | null): boolean {
    if (!fromDate && !toDate) return true;
    if (!dueDate) return false;
    const due = new Date(dueDate);
    if (fromDate && due < new Date(fromDate)) return false;
    if (toDate && due > new Date(toDate)) return false;
    return true;
  }

  const filteredPayments = useMemo(
    () =>
      pendingPayments.filter((row) => {
        if (company !== "all" && row.companyName !== company) return false;
        if (!inDateRange(row.dueDate)) return false;
        return true;
      }),
    [pendingPayments, company, fromDate, toDate]
  );

  const filteredCollections = useMemo(
    () =>
      pendingCollections.filter((row) => {
        if (company !== "all" && row.companyName !== company) return false;
        if (!inDateRange(row.dueDate)) return false;
        return true;
      }),
    [pendingCollections, company, fromDate, toDate]
  );

  const totalPendingPayments = filteredPayments.reduce((sum, row) => sum + row.effectivePending, 0);
  const totalPendingCollections = filteredCollections.reduce(
    (sum, row) => sum + row.effectivePending,
    0
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Pagos y Cobros</h1>
        <p className="text-sm text-gray-500 mt-1">
          {filteredPayments.length} pagos pendientes ({formatCurrency(totalPendingPayments)}) ·{" "}
          {filteredCollections.length} cobros pendientes ({formatCurrency(totalPendingCollections)})
        </p>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <select
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">Todas las empresas</option>
          {companies.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          aria-label="Fecha desde"
        />
        <input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          aria-label="Fecha hasta"
        />
        <span className="text-xs text-gray-500">Filtro por fecha de vencimiento</span>
        {hasFilters && (
          <button
            onClick={() => {
              setCompany("all");
              setFromDate("");
              setToDate("");
            }}
            className="text-sm text-gray-500 hover:text-gray-700 px-2 py-2"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Pagos pendientes</h2>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="grid grid-cols-[1fr_1fr_1fr_130px_130px_90px] gap-3 bg-gray-50 border-b border-gray-100 px-4 py-2 text-xs font-medium text-gray-500">
            <div>Proveedor</div>
            <div>Factura</div>
            <div>Empresa</div>
            <div className="text-right">Vencimiento</div>
            <div className="text-right">Pendiente</div>
            <div className="text-right">Holded</div>
          </div>
          {filteredPayments.map((row) => (
            <div
              key={row.id}
              className="grid grid-cols-[1fr_1fr_1fr_130px_130px_90px] gap-3 items-center px-4 py-3 border-b border-gray-100 last:border-0 text-sm"
            >
              <div className="truncate text-gray-900">{row.counterparty ?? "—"}</div>
              <div className="truncate text-gray-600">{row.number ?? row.holdedId.slice(0, 8)}</div>
              <div className="truncate text-gray-600">{row.companyName}</div>
              <div className="text-right text-gray-600">
                {row.dueDate ? formatDate(row.dueDate) : "Sin fecha"}
              </div>
              <div className="text-right font-semibold text-red-600">
                {formatCurrency(row.effectivePending)}
              </div>
              <div className="text-right">
                <Link
                  href={holdedInvoiceUrl(row.holdedId, row.type)}
                  target="_blank"
                  className="text-xs text-indigo-600 hover:text-indigo-700"
                >
                  Abrir
                </Link>
              </div>
            </div>
          ))}
          {filteredPayments.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-gray-400">
              No hay pagos pendientes con los filtros actuales.
            </p>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Cobros pendientes</h2>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="grid grid-cols-[1fr_1fr_1fr_130px_130px_90px] gap-3 bg-gray-50 border-b border-gray-100 px-4 py-2 text-xs font-medium text-gray-500">
            <div>Cliente</div>
            <div>Factura</div>
            <div>Empresa</div>
            <div className="text-right">Vencimiento</div>
            <div className="text-right">Pendiente</div>
            <div className="text-right">Holded</div>
          </div>
          {filteredCollections.map((row) => (
            <div
              key={row.id}
              className="grid grid-cols-[1fr_1fr_1fr_130px_130px_90px] gap-3 items-center px-4 py-3 border-b border-gray-100 last:border-0 text-sm"
            >
              <div className="truncate text-gray-900">{row.counterparty ?? "—"}</div>
              <div className="truncate text-gray-600">{row.number ?? row.holdedId.slice(0, 8)}</div>
              <div className="truncate text-gray-600">{row.companyName}</div>
              <div className="text-right text-gray-600">
                {row.dueDate ? formatDate(row.dueDate) : "Sin fecha"}
              </div>
              <div className="text-right font-semibold text-amber-600">
                {formatCurrency(row.effectivePending)}
              </div>
              <div className="text-right">
                <Link
                  href={holdedInvoiceUrl(row.holdedId, row.type)}
                  target="_blank"
                  className="text-xs text-indigo-600 hover:text-indigo-700"
                >
                  Abrir
                </Link>
              </div>
            </div>
          ))}
          {filteredCollections.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-gray-400">
              No hay cobros pendientes con los filtros actuales.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
