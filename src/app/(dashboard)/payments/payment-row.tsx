"use client";

import { useState, useTransition } from "react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { registerPayment } from "./actions";
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
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState(invoice.effectivePending.toFixed(2));
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();

  const isPaid = invoice.effectivePending <= 0.005;

  function handleSubmit(): void {
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) return;
    startTransition(async () => {
      await registerPayment({ invoiceId: invoice.id, amount: parsedAmount, paidAt, notes });
      setShowForm(false);
      setNotes("");
    });
  }

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

        {!isPaid && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="shrink-0 rounded-lg border border-indigo-300 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50 transition-colors"
          >
            Registrar pago
          </button>
        )}
        {isPaid && <div className="w-[110px] shrink-0" />}
      </div>

      {/* Payment form */}
      {showForm && (
        <div className="px-12 pb-3 flex flex-wrap gap-3 items-end bg-indigo-50 border-t border-indigo-100">
          <div className="flex flex-col gap-1 pt-3">
            <label className="text-xs text-gray-500">Importe (€)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white w-32"
              disabled={isPending}
            />
          </div>
          <div className="flex flex-col gap-1 pt-3">
            <label className="text-xs text-gray-500">Fecha pago</label>
            <input
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
              disabled={isPending}
            />
          </div>
          <div className="flex flex-col gap-1 pt-3 flex-1 min-w-[180px]">
            <label className="text-xs text-gray-500">Notas</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Opcional…"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
              disabled={isPending}
            />
          </div>
          <div className="flex gap-2 pb-0.5 pt-3">
            <button
              onClick={handleSubmit}
              disabled={isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {isPending ? "Guardando…" : "Guardar"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

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
