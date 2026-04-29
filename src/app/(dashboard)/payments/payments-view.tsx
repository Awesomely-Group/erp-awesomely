"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatCurrency, formatDate, holdedInvoiceUrl } from "@/lib/utils";
import { PaymentRow, type PaymentInvoice } from "./payment-row";

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
  pendingPayments: PaymentInvoice[];
  pendingCollections: PendingInvoice[];
  companies: string[];
}

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

export function PaymentsView({
  pendingPayments,
  pendingCollections,
  companies,
}: Props): React.JSX.Element {
  const [tab, setTab] = useState<"pagos" | "cobros">("pagos");
  const [company, setCompany] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const hasFilters = company !== "all" || fromDate !== "" || toDate !== "";

  const filteredPayments = useMemo(
    () =>
      pendingPayments.filter((row) => {
        if (company !== "all" && row.companyName !== company) return false;
        if (fromDate || toDate) {
          if (!row.dueDate) return false;
          const due = new Date(row.dueDate);
          if (fromDate && due < new Date(fromDate)) return false;
          if (toDate && due > new Date(toDate)) return false;
        }
        return true;
      }),
    [pendingPayments, company, fromDate, toDate]
  );

  const filteredCollections = useMemo(
    () =>
      pendingCollections.filter((row) => {
        if (company !== "all" && row.companyName !== company) return false;
        if (fromDate || toDate) {
          if (!row.dueDate) return false;
          const due = new Date(row.dueDate);
          if (fromDate && due < new Date(fromDate)) return false;
          if (toDate && due > new Date(toDate)) return false;
        }
        return true;
      }),
    [pendingCollections, company, fromDate, toDate]
  );

  const totalPendingPayments = filteredPayments.reduce((s, r) => s + r.effectivePending, 0);
  const totalPendingCollections = filteredCollections.reduce((s, r) => s + r.effectivePending, 0);
  const balance = totalPendingCollections - totalPendingPayments;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Pagos y Cobros</h1>
        <p className="text-sm text-gray-500 mt-1">Facturas pendientes de pago y cobro</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Pagos pendientes</p>
          <p className="mt-1 text-2xl font-bold text-red-600">{formatCurrency(totalPendingPayments)}</p>
          <p className="text-xs text-gray-400 mt-1">{filteredPayments.length} facturas</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Cobros pendientes</p>
          <p className="mt-1 text-2xl font-bold text-green-600">{formatCurrency(totalPendingCollections)}</p>
          <p className="text-xs text-gray-400 mt-1">{filteredCollections.length} facturas</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Balance neto</p>
          <p className={`mt-1 text-2xl font-bold ${balance >= 0 ? "text-indigo-600" : "text-amber-600"}`}>
            {formatCurrency(balance)}
          </p>
          <p className="text-xs text-gray-400 mt-1">{balance >= 0 ? "A favor" : "En contra"}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
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
        <span className="text-xs text-gray-500">Filtro por vencimiento</span>
        {hasFilters && (
          <button
            onClick={() => { setCompany("all"); setFromDate(""); setToDate(""); }}
            className="text-sm text-gray-500 hover:text-gray-700 px-2 py-2"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          <button
            onClick={() => setTab("pagos")}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              tab === "pagos"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Pagos pendientes
            <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
              {filteredPayments.length}
            </span>
          </button>
          <button
            onClick={() => setTab("cobros")}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              tab === "cobros"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Cobros pendientes
            <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
              {filteredCollections.length}
            </span>
          </button>
        </nav>
      </div>

      {/* Pagos tab */}
      {tab === "pagos" && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {filteredPayments.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-400">
              No hay pagos pendientes con los filtros actuales.
            </p>
          ) : (
            filteredPayments.map((inv) => <PaymentRow key={inv.id} invoice={inv} />)
          )}
        </div>
      )}

      {/* Cobros tab */}
      {tab === "cobros" && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="grid grid-cols-[1fr_1fr_1fr_140px_130px_90px] gap-3 bg-gray-50 border-b border-gray-100 px-4 py-2 text-xs font-medium text-gray-500">
            <div>Cliente</div>
            <div>Factura</div>
            <div>Empresa</div>
            <div className="text-right">Vencimiento</div>
            <div className="text-right">Pendiente</div>
            <div className="text-right">Holded</div>
          </div>
          {filteredCollections.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-400">
              No hay cobros pendientes con los filtros actuales.
            </p>
          ) : (
            filteredCollections.map((row) => {
              const overdue = isOverdue(row.dueDate);
              return (
                <div
                  key={row.id}
                  className="grid grid-cols-[1fr_1fr_1fr_140px_130px_90px] gap-3 items-center px-4 py-3 border-b border-gray-100 last:border-0 text-sm"
                >
                  <div className="truncate text-gray-900">{row.counterparty ?? "—"}</div>
                  <div className="truncate text-gray-600">{row.number ?? row.holdedId.slice(0, 8)}</div>
                  <div className="truncate text-gray-600">{row.companyName}</div>
                  <div className="text-right flex items-center justify-end gap-2">
                    {overdue && (
                      <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-600">
                        Vencido
                      </span>
                    )}
                    <span className={overdue ? "text-red-600 font-medium" : "text-gray-600"}>
                      {row.dueDate ? formatDate(row.dueDate) : "Sin fecha"}
                    </span>
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
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
