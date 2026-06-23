"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GripVertical } from "lucide-react";
import { formatCurrency, formatDate, holdedInvoiceUrl } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { registerPayment } from "./actions";

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
  verificationStatus?: string | null;
  erpPayments: { id: string; amount: number; paidAt: string; paidBy: string; notes: string | null }[];
  contactIban: string | null;
  contactHoldedUrl: string | null;
}

interface Props {
  invoice: PaymentInvoice;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function PaymentRow({ invoice, dragHandleProps }: Props): React.JSX.Element {
  const [showPayForm, setShowPayForm] = useState(false);
  const [amount, setAmount] = useState(invoice.effectivePending.toFixed(2));
  const [paidAt, setPaidAt] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const isPaid = invoice.effectivePending <= 0.005;

  function handleSubmit(): void {
    startTransition(async () => {
      await registerPayment({
        invoiceId: invoice.id,
        amount: parseFloat(amount),
        paidAt,
        notes,
      });
      setShowPayForm(false);
      setAmount(invoice.effectivePending.toFixed(2));
      setNotes("");
      router.refresh();
    });
  }

  return (
    <div className={cn("border-b border-gray-100 last:border-0", isPaid && "opacity-60")}>
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
        {dragHandleProps && (
          <button
            type="button"
            {...dragHandleProps}
            className="shrink-0 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 touch-none focus:outline-none"
            tabIndex={-1}
            aria-label="Arrastrar para reordenar"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-gray-900 truncate">
              {invoice.counterparty ?? "—"}
            </p>
            {invoice.verificationStatus === "APPROVED" && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 shrink-0">Verificado ✓</span>
            )}
            {invoice.verificationStatus === "PERIOD_MISMATCH" && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 shrink-0">Período incorrecto</span>
            )}
            {invoice.verificationStatus === "VERIFIED_MISMATCH" && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700 shrink-0">Importe incorrecto</span>
            )}
            {invoice.verificationStatus != null &&
              invoice.verificationStatus !== "APPROVED" &&
              invoice.verificationStatus !== "PERIOD_MISMATCH" &&
              invoice.verificationStatus !== "VERIFIED_MISMATCH" && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 shrink-0">Pendiente verificar</span>
            )}
          </div>
          <p className="text-xs text-gray-400">
            {invoice.number ?? invoice.holdedId.slice(0, 8)} · {invoice.companyName}
            {invoice.dueDate && ` · Vence ${formatDate(invoice.dueDate)}`}
          </p>
          {/* IBAN + contact link */}
          {(invoice.contactIban ?? invoice.contactHoldedUrl) && (
            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">
              {invoice.contactIban && (
                <span className="font-mono tracking-tight">{invoice.contactIban}</span>
              )}
              {invoice.contactHoldedUrl && (
                <Link
                  href={invoice.contactHoldedUrl}
                  target="_blank"
                  className="text-indigo-500 hover:text-indigo-700"
                >
                  Contacto ↗
                </Link>
              )}
            </p>
          )}
        </div>

        <div className="text-right shrink-0 w-28">
          <p className="text-xs text-gray-400">Total factura</p>
          <p className="text-sm font-medium text-gray-700">{formatCurrency(invoice.totalEur)}</p>
        </div>

        <div className="text-right shrink-0 w-28">
          <p className="text-xs text-gray-400">Pendiente conciliar</p>
          <p className={cn("text-sm font-semibold", isPaid ? "text-green-600" : "text-red-600")}>
            {isPaid ? "Pagado" : formatCurrency(invoice.effectivePending)}
          </p>
        </div>

        <div className="shrink-0 flex items-center gap-2">
          <Link
            href={`/invoices/${invoice.id}`}
            className="text-xs text-indigo-600 hover:text-indigo-700 whitespace-nowrap"
          >
            ERP
          </Link>
          <span className="text-gray-300">·</span>
          <Link
            href={holdedInvoiceUrl(invoice.holdedId, "PURCHASE")}
            target="_blank"
            className="text-xs text-indigo-600 hover:text-indigo-700 whitespace-nowrap"
          >
            Holded
          </Link>
          {!isPaid && (
            <>
              <span className="text-gray-300">·</span>
              <button
                onClick={() => setShowPayForm((v) => !v)}
                className="text-xs font-medium text-emerald-600 hover:text-emerald-700 whitespace-nowrap"
              >
                {showPayForm ? "Cancelar" : "Marcar pagada"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Inline pay form */}
      {showPayForm && (
        <div className="px-4 pb-3 flex flex-wrap items-end gap-3 bg-emerald-50 border-t border-emerald-100">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Importe</label>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Fecha pago</label>
            <input
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-40">
            <label className="text-xs text-gray-500">Notas (opcional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Referencia, comentario…"
              className="rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={isPending || !amount}
            className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? "Guardando…" : "Guardar"}
          </button>
        </div>
      )}

      {/* ERP payments — always visible */}
      <div className="px-4 pb-3">
        {invoice.erpPayments.length > 0 ? (
          <div className="space-y-1">
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
        ) : (
          <p className="text-xs text-gray-400">Sin pagos registrados en ERP</p>
        )}
      </div>
    </div>
  );
}
