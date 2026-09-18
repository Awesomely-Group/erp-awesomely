"use client";

import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import type { InvoiceDetail, InvoiceDetailLine } from "@/lib/invoice-detail";

/**
 * Presentación del detalle de una factura del ERP. A diferencia de
 * `invoices/invoice-line-panel.tsx` —que es un Server Component y arrastra los
 * formularios de clasificación contable— esto es solo lectura y se puede
 * montar en cualquier cliente, que es lo que necesita la vista previa de Pagos
 * cuando Holded no tiene PDF que servir.
 */

export function InvoiceDetailHeader({
  detail,
  children,
}: {
  detail: InvoiceDetail;
  children?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="px-4 py-3 border-b border-gray-100">
      {detail.removedFromHoldedAt && (
        <p className="mb-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
          Esta factura ya no está en Holded (detectado el{" "}
          {formatDate(detail.removedFromHoldedAt)}).
        </p>
      )}

      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-gray-900 truncate">
          {detail.counterparty ?? "Sin contraparte"}
        </p>
        <p className="text-sm font-bold text-gray-900 shrink-0">
          {formatCurrency(detail.totalEur)}
        </p>
      </div>

      <p className="mt-0.5 text-xs text-gray-500">
        {detail.number ?? detail.holdedId.slice(0, 8)} · {detail.companyName} ·{" "}
        {formatDate(detail.date)}
        {detail.dueDate && <> · Vence {formatDate(detail.dueDate)}</>}
      </p>

      <p className="mt-0.5 text-xs text-gray-400">
        Base {formatCurrency(detail.subtotal)} · IVA {formatCurrency(detail.tax)}
        {detail.currency !== "EUR" && (
          <> · {detail.currency} (cambio {formatNumber(detail.fxRateToEur, { decimals: 4 })})</>
        )}
      </p>

      {children}
    </div>
  );
}

export function InvoiceLinesTable({
  lines,
}: {
  lines: readonly InvoiceDetailLine[];
}): React.JSX.Element {
  if (lines.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-xs text-gray-400">
        Esta factura no tiene líneas sincronizadas.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-100 text-gray-400">
            <th className="px-4 py-2 text-left font-medium">Concepto</th>
            <th className="px-2 py-2 text-right font-medium">Cant.</th>
            <th className="px-2 py-2 text-right font-medium">Precio</th>
            <th className="px-4 py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id} className="border-b border-gray-50 align-top">
              <td className="px-4 py-2">
                <p className="text-gray-800">{line.name}</p>
                {line.description && (
                  <p className="text-gray-400">{line.description}</p>
                )}
                {line.accountingAccount && (
                  <p className="text-gray-400">
                    {line.accountingAccount}
                    {line.accountingAccountName
                      ? ` · ${line.accountingAccountName}`
                      : ""}
                  </p>
                )}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-gray-600">
                {formatNumber(line.quantity, { decimals: 2 })}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-gray-600">
                {formatCurrency(line.unitPrice)}
              </td>
              <td className="px-4 py-2 text-right tabular-nums font-medium text-gray-800">
                {formatCurrency(line.total)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function InvoiceDetailView({
  detail,
}: {
  detail: InvoiceDetail;
}): React.JSX.Element {
  return (
    <div className="h-full overflow-y-auto bg-white">
      <InvoiceDetailHeader detail={detail}>
        <div className="mt-2 flex items-center gap-3 text-xs">
          <a
            href={`/invoices/${detail.id}`}
            className="text-indigo-600 hover:text-indigo-700 hover:underline"
          >
            Abrir en ERP ↗
          </a>
          <a
            href={detail.holdedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-600 hover:text-indigo-700 hover:underline"
          >
            Ver en Holded ↗
          </a>
        </div>
      </InvoiceDetailHeader>
      <InvoiceLinesTable lines={detail.lines} />
    </div>
  );
}
