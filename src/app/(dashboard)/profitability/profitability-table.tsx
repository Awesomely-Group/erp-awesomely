"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { formatCurrency, formatDate, holdedInvoiceUrl, cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import type { ProfitabilityRow } from "@/lib/profitability";

interface Props {
  rows: ProfitabilityRow[];
}

export function ProfitabilityTable({ rows }: Props): React.JSX.Element {
  const [expandedProject, setExpandedProject] = useState<string | null>(null);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="px-4 py-3 text-left font-medium text-gray-600">Proyecto</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Workspace</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">Ingresos</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">Gastos</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">Margen</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">%</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                No hay datos clasificados para este período
              </td>
            </tr>
          )}
          {rows.map((row) => {
            const isExpanded = expandedProject === row.projectId;
            return (
              <Fragment key={row.projectId}>
                <tr
                  onClick={() => setExpandedProject(isExpanded ? null : row.projectId)}
                  className="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3 font-medium text-gray-900">
                    <div className="flex items-center gap-2">
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 text-gray-400 transition-transform flex-shrink-0",
                          isExpanded && "rotate-180"
                        )}
                      />
                      {row.projectName}
                      <span className="text-xs text-gray-400 font-normal">
                        ({row.invoices.length})
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{row.workspaceName}</td>
                  <td className="px-4 py-3 text-right text-green-600">
                    {formatCurrency(row.revenue)}
                  </td>
                  <td className="px-4 py-3 text-right text-red-600">
                    {formatCurrency(row.costs)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-medium ${
                      row.margin >= 0 ? "text-indigo-600" : "text-red-600"
                    }`}
                  >
                    {formatCurrency(row.margin)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        row.marginPct >= 20
                          ? "bg-green-100 text-green-700"
                          : row.marginPct >= 0
                            ? "bg-amber-100 text-amber-700"
                            : "bg-red-100 text-red-700"
                      }`}
                    >
                      {row.marginPct.toFixed(1)}%
                    </span>
                  </td>
                </tr>
                {isExpanded && (
                  <tr className="border-b border-gray-100">
                    <td colSpan={6} className="bg-gray-50 px-4 py-3">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-gray-400">
                            <th className="pb-2 text-left font-medium pl-6">Número</th>
                            <th className="pb-2 text-left font-medium">Contraparte</th>
                            <th className="pb-2 text-left font-medium">Fecha</th>
                            <th className="pb-2 text-left font-medium">Tipo</th>
                            <th className="pb-2 text-right font-medium">Importe</th>
                          </tr>
                        </thead>
                        <tbody>
                          {row.invoices.map((inv) => (
                            <tr key={inv.id} className="border-t border-gray-100">
                              <td className="py-1.5 pl-6">
                                <div className="flex items-center gap-1.5">
                                  <Link
                                    href={`/invoices?invoiceId=${inv.id}`}
                                    className="font-medium text-indigo-600 hover:underline"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {inv.number ?? (
                                      <span className="italic text-gray-400">Borrador</span>
                                    )}
                                  </Link>
                                  <a
                                    href={holdedInvoiceUrl(inv.holdedId, inv.type)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-gray-300 hover:text-indigo-500 transition-colors"
                                  >
                                    ↗
                                  </a>
                                </div>
                              </td>
                              <td className="py-1.5 text-gray-600 max-w-[180px] truncate">
                                {inv.counterparty ?? "—"}
                              </td>
                              <td className="py-1.5 text-gray-500">{formatDate(inv.date)}</td>
                              <td className="py-1.5">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                    inv.type === "SALE"
                                      ? "bg-green-50 text-green-700"
                                      : "bg-red-50 text-red-700"
                                  }`}
                                >
                                  {inv.type === "SALE" ? "Venta" : "Compra"}
                                </span>
                              </td>
                              <td
                                className={`py-1.5 text-right font-medium ${
                                  inv.type === "SALE" ? "text-green-600" : "text-red-600"
                                }`}
                              >
                                {formatCurrency(inv.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
