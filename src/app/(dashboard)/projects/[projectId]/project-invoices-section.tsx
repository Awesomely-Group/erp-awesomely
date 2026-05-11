"use client";

import React, { useState } from "react";
import Link from "next/link";
import { formatCurrency, formatDate, holdedInvoiceUrl } from "@/lib/utils";

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

export function ProjectInvoicesSection({ invoices }: Props): React.JSX.Element {
  const [open, setOpen] = useState(true);

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
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Número</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Entidad legal</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Contraparte</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Fecha</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Total (EUR)</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Estado</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
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
                    <td className="px-4 py-2.5 text-gray-600">{inv.companyName}</td>
                    <td className="px-4 py-2.5 text-gray-600 max-w-[180px] truncate">{inv.counterparty ?? "—"}</td>
                    <td className="px-4 py-2.5 text-gray-600">{formatDate(inv.date)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium text-gray-900">
                      {formatCurrency(inv.totalEur)}
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
            </table>
          </div>
        )
      )}
    </section>
  );
}
