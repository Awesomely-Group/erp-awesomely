"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { formatCurrency, formatDate, holdedInvoiceUrl } from "@/lib/utils";
import { SortThClick } from "@/components/sort-th";

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

export interface InvoiceRow {
  id: string;
  holdedId: string;
  type: "SALE" | "PURCHASE";
  number: string | null;
  companyName: string;
  counterparty: string | null;
  date: string;
  totalEur: number;
  holdedStatus: number | null;
}

interface Props {
  invoices: InvoiceRow[];
}

type SortKey = "number" | "type" | "companyName" | "counterparty" | "date" | "totalEur" | "holdedStatus";
type SortDir = "asc" | "desc";

export function ProjectInvoicesSection({ invoices }: Props): React.JSX.Element {
  const [open, setOpen] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleSort(col: SortKey): void {
    if (sortKey === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col);
      setSortDir("asc");
    }
  }

  const sorted = useMemo(() => {
    return [...invoices].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "number": cmp = (a.number ?? "").localeCompare(b.number ?? ""); break;
        case "type": cmp = a.type.localeCompare(b.type); break;
        case "companyName": cmp = a.companyName.localeCompare(b.companyName); break;
        case "counterparty": cmp = (a.counterparty ?? "").localeCompare(b.counterparty ?? ""); break;
        case "date": cmp = new Date(a.date).getTime() - new Date(b.date).getTime(); break;
        case "totalEur": cmp = a.totalEur - b.totalEur; break;
        case "holdedStatus": cmp = (a.holdedStatus ?? -999) - (b.holdedStatus ?? -999); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [invoices, sortKey, sortDir]);

  const totalSale = invoices
    .filter((inv) => inv.type === "SALE")
    .reduce((sum, inv) => sum + inv.totalEur, 0);
  const totalPurchase = invoices
    .filter((inv) => inv.type === "PURCHASE")
    .reduce((sum, inv) => sum + inv.totalEur, 0);

  return (
    <section className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 group"
      >
        <svg
          className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? "" : "-rotate-90"}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
        <h2 className="text-base font-semibold text-gray-800 group-hover:text-gray-900 transition-colors">
          Facturas relacionadas
          {invoices.length > 0 && (
            <span className="ml-2 text-xs font-normal text-gray-400">{invoices.length}</span>
          )}
        </h2>
      </button>

      {open && (
        invoices.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-8 text-center text-sm text-gray-400">
            Sin facturas clasificadas en este período
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <SortThClick label="Número" active={sortKey === "number"} sortDir={sortDir} onClick={() => handleSort("number")} />
                  <SortThClick label="Tipo" active={sortKey === "type"} sortDir={sortDir} onClick={() => handleSort("type")} />
                  <SortThClick label="Entidad legal" active={sortKey === "companyName"} sortDir={sortDir} onClick={() => handleSort("companyName")} />
                  <SortThClick label="Contraparte" active={sortKey === "counterparty"} sortDir={sortDir} onClick={() => handleSort("counterparty")} />
                  <SortThClick label="Fecha" active={sortKey === "date"} sortDir={sortDir} onClick={() => handleSort("date")} />
                  <SortThClick label="Total (EUR)" active={sortKey === "totalEur"} sortDir={sortDir} onClick={() => handleSort("totalEur")} align="right" />
                  <SortThClick label="Estado" active={sortKey === "holdedStatus"} sortDir={sortDir} onClick={() => handleSort("holdedStatus")} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((inv) => (
                  <tr key={inv.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/invoices/${inv.id}`}
                          className="font-medium text-gray-900 hover:text-indigo-600 transition-colors"
                        >
                          {inv.number ?? <span className="italic text-gray-400 font-normal">Borrador</span>}
                        </Link>
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
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        inv.type === "SALE"
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}>
                        {inv.type === "SALE" ? "Ingreso" : "Gasto"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{inv.companyName}</td>
                    <td className="px-4 py-2.5 text-gray-600 max-w-[180px] truncate">{inv.counterparty ?? "—"}</td>
                    <td className="px-4 py-2.5 text-gray-600">{formatDate(inv.date)}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${
                      inv.type === "SALE" ? "text-green-600" : "text-red-600"
                    }`}>
                      {inv.type === "SALE" ? "+" : "-"}{formatCurrency(inv.totalEur)}
                    </td>
                    <td className="px-4 py-2.5">
                      {inv.holdedStatus != null && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${HOLDED_STATUS_COLORS[inv.holdedStatus] ?? "bg-gray-100 text-gray-500"}`}>
                          {HOLDED_STATUS_LABELS[inv.holdedStatus] ?? String(inv.holdedStatus)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td className="px-4 py-2.5 text-xs font-medium text-gray-500" colSpan={5}>
                    Totales
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex flex-col items-end gap-0.5">
                      {totalSale > 0 && (
                        <span className="text-xs font-semibold text-green-600 tabular-nums">
                          +{formatCurrency(totalSale)}
                        </span>
                      )}
                      {totalPurchase > 0 && (
                        <span className="text-xs font-semibold text-red-600 tabular-nums">
                          -{formatCurrency(totalPurchase)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )
      )}
    </section>
  );
}
