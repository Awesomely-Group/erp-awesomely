"use client";

import { useState } from "react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PaymentInvoice {
  id: string;
  holdedId: string;
  number: string | null;
  counterparty: string | null;
  dueDate: string | null;
  totalEur: number;
  paymentsPending: number; // from Holded
  erpPaid: number;         // sum of local ERP payments
  effectivePending: number;
  companyName: string;
  erpPayments: { id: string; amount: number; paidAt: string; paidBy: string; notes: string | null }[];
}

interface Props {
  invoice: PaymentInvoice;
}

export function PaymentRow({ invoice }: Props): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);

  const isPaid = invoice.effectivePending <= 0.005;

  return (
    <div className={cn("border-b border-gray-100 last:border-0", isPaid && "opacity-60")}>
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
        <button onClick={() => setExpanded((v) => !v)} className="shrink-0 text-gray-400">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            {invoice.counterparty ?? "—"}
          </p>
          <p className="text-xs text-gray-400">
            {invoice.number ?? invoice.holdedId.slice(0, 8)} · {invoice.companyName}
            {invoice.dueDate && ` · Vence ${formatDate(invoice.dueDate)}`}
          </p>
        </div>

        <div className="text-right shrink-0 w-28">
          <p className="text-xs text-gray-400">Total factura</p>
          <p className="text-sm font-medium text-gray-700">{formatCurrency(invoice.totalEur)}</p>
        </div>

        <div className="text-right shrink-0 w-28">
          <p className="text-xs text-gray-400">Pendiente</p>
          <p className={cn("text-sm font-semibold", isPaid ? "text-green-600" : "text-red-600")}>
            {isPaid ? "Pagado" : formatCurrency(invoice.effectivePending)}
          </p>
        </div>
      </div>

      {/* Expanded: payment history */}
      {expanded && invoice.erpPayments.length > 0 && (
        <div className="px-12 pb-3 space-y-1">
          <p className="text-xs font-medium text-gray-500 mb-1">Pagos registrados en ERP</p>
          {invoice.erpPayments.map((p) => (
            <div key={p.id} className="flex items-center gap-4 text-xs text-gray-600">
              <span className="font-medium text-green-700">{formatCurrency(p.amount)}</span>
              <span>{formatDate(p.paidAt)}</span>
              <span className="text-gray-400">{p.paidBy}</span>
              {p.notes && <span className="italic text-gray-400">{p.notes}</span>}
            </div>
          ))}
        </div>
      )}
      {expanded && invoice.erpPayments.length === 0 && (
        <div className="px-12 pb-3 text-xs text-gray-400">Sin pagos registrados en ERP</div>
      )}
    </div>
  );
}
