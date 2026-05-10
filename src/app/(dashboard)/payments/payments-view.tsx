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

// ─── Month grouping ───────────────────────────────────────────────────────────

interface MonthGroup<T> {
  key: string;
  label: string;
  isPast: boolean;
  isCurrent: boolean;
  items: T[];
  subtotal: number;
}

function groupByDueMonth<T extends { dueDate: string | null; effectivePending: number }>(
  items: T[],
): MonthGroup<T>[] {
  const now = new Date();
  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = item.dueDate ? item.dueDate.slice(0, 7) : "sin-fecha";
    const bucket = map.get(key) ?? [];
    bucket.push(item);
    map.set(key, bucket);
  }

  const groups: MonthGroup<T>[] = [];
  for (const [key, groupItems] of map.entries()) {
    if (key === "sin-fecha") continue;
    const [year, month] = key.split("-").map(Number) as [number, number];
    const d = new Date(year, month - 1, 1);
    const label = d.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
    groups.push({
      key,
      label: label.charAt(0).toUpperCase() + label.slice(1),
      isPast: key < currentKey,
      isCurrent: key === currentKey,
      items: groupItems,
      subtotal: groupItems.reduce((s, i) => s + i.effectivePending, 0),
    });
  }

  groups.sort((a, b) => a.key.localeCompare(b.key));

  if (map.has("sin-fecha")) {
    const groupItems = map.get("sin-fecha")!;
    groups.push({
      key: "sin-fecha",
      label: "Sin fecha",
      isPast: false,
      isCurrent: false,
      items: groupItems,
      subtotal: groupItems.reduce((s, i) => s + i.effectivePending, 0),
    });
  }

  return groups;
}

// ─── Month section header ─────────────────────────────────────────────────────

interface MonthSectionHeaderProps {
  label: string;
  count: number;
  subtotal: number;
  isPast: boolean;
  isCurrent: boolean;
}

function MonthSectionHeader({ label, count, subtotal, isPast, isCurrent }: MonthSectionHeaderProps): React.JSX.Element {
  let bg = "bg-gray-50 text-gray-600 border-gray-100";
  if (isPast) bg = "bg-red-50 text-red-700 border-red-100";
  else if (isCurrent) bg = "bg-indigo-50 text-indigo-700 border-indigo-100";

  return (
    <div className={`flex items-center justify-between px-4 py-2 border-b text-xs font-semibold ${bg}`}>
      <div className="flex items-center gap-2">
        <span>{label}</span>
        {isPast && (
          <span className="rounded-full bg-red-100 text-red-600 px-1.5 py-0.5 text-[10px] font-medium">
            Vencido
          </span>
        )}
        {isCurrent && (
          <span className="rounded-full bg-indigo-100 text-indigo-600 px-1.5 py-0.5 text-[10px] font-medium">
            Este mes
          </span>
        )}
        <span className="font-normal text-current opacity-60">
          {count} {count === 1 ? "factura" : "facturas"}
        </span>
      </div>
      <span>{formatCurrency(subtotal)}</span>
    </div>
  );
}

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

// ─── Main view ────────────────────────────────────────────────────────────────

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
    [pendingPayments, company, fromDate, toDate],
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
    [pendingCollections, company, fromDate, toDate],
  );

  const paymentsGroups = useMemo(() => groupByDueMonth(filteredPayments), [filteredPayments]);
  const collectionsGroups = useMemo(() => groupByDueMonth(filteredCollections), [filteredCollections]);

  const totalPendingPayments = filteredPayments.reduce((s, r) => s + r.effectivePending, 0);
  const totalPendingCollections = filteredCollections.reduce((s, r) => s + r.effectivePending, 0);
  const balance = totalPendingCollections - totalPendingPayments;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pagos y Cobros</h1>
          <p className="text-sm text-gray-500 mt-1">Facturas pendientes de pago y cobro</p>
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500 font-medium">Empresa</label>
            <select
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Todas</option>
              {companies.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500 font-medium">Desde</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500 font-medium">Hasta</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          {hasFilters && (
            <button
              onClick={() => { setCompany("all"); setFromDate(""); setToDate(""); }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Limpiar
            </button>
          )}
        </div>
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
            paymentsGroups.map((group) => (
              <div key={group.key}>
                <MonthSectionHeader
                  label={group.label}
                  count={group.items.length}
                  subtotal={group.subtotal}
                  isPast={group.isPast}
                  isCurrent={group.isCurrent}
                />
                {group.items.map((inv) => (
                  <PaymentRow key={inv.id} invoice={inv} />
                ))}
              </div>
            ))
          )}
        </div>
      )}

      {/* Cobros tab */}
      {tab === "cobros" && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Column header */}
          <div className="grid grid-cols-[1fr_1fr_1fr_140px_130px_90px] gap-3 bg-gray-50 border-b border-gray-200 px-4 py-2 text-xs font-medium text-gray-500">
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
            collectionsGroups.map((group) => (
              <div key={group.key}>
                <MonthSectionHeader
                  label={group.label}
                  count={group.items.length}
                  subtotal={group.subtotal}
                  isPast={group.isPast}
                  isCurrent={group.isCurrent}
                />
                {group.items.map((row) => {
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
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
