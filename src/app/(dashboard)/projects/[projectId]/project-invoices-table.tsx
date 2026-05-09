"use client";

import Link from "next/link";
import { formatCurrency, formatDate, holdedInvoiceUrl } from "@/lib/utils";
import type { ProfitabilityInvoice } from "@/lib/profitability";

interface Props {
  invoices: ProfitabilityInvoice[];
}

export function ProjectInvoicesTable({ invoices }: Props): React.JSX.Element {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="px-4 py-3 text-left font-medium text-gray-600">Número</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Contraparte</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Fecha</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Tipo</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">Importe</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => (
            <tr key={inv.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <Link
                    href={`/invoices?invoiceId=${inv.id}`}
                    className="font-medium text-indigo-600 hover:underline"
                  >
                    {inv.number ?? <span className="italic text-gray-400">Borrador</span>}
                  </Link>
                  <a
                    href={holdedInvoiceUrl(inv.holdedId, inv.type)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-300 hover:text-indigo-500 transition-colors"
                  >
                    ↗
                  </a>
                </div>
              </td>
              <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">
                {inv.counterparty ?? "—"}
              </td>
              <td className="px-4 py-3 text-gray-500">{formatDate(inv.date)}</td>
              <td className="px-4 py-3">
                <span
                  className={`px-2 py-0.5 rounded text-xs font-medium ${
                    inv.type === "SALE"
                      ? "bg-green-50 text-green-700"
                      : "bg-red-50 text-red-700"
                  }`}
                >
                  {inv.type === "SALE" ? "Venta" : "Compra"}
                </span>
              </td>
              <td className={`px-4 py-3 text-right font-medium ${inv.type === "SALE" ? "text-green-600" : "text-red-600"}`}>
                {formatCurrency(inv.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
