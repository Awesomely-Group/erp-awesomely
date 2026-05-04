"use client";

import { useState, useTransition } from "react";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  captureTempoHours,
  linkInvoice,
  verifyPeriod,
  relinkInvoice,
  approveForPayment,
  saveNotes,
} from "./actions";

export interface SerializedVerification {
  id: string;
  supplierId: string;
  periodStart: string;
  periodEnd: string;
  tempoHours: number | null;
  expectedAmount: number | null;
  capturedAt: string | null;
  invoiceId: string | null;
  invoicedAmount: number | null;
  invoiceServicePeriodStart: string | null;
  invoiceServicePeriodEnd: string | null;
  periodMismatch: boolean | null;
  status: string;
  verifiedAt: string | null;
  verifiedBy: string | null;
  notes: string | null;
  invoice: { number: string | null; counterparty: string | null; totalEur: number } | null;
}

export interface AvailableInvoice {
  id: string;
  number: string | null;
  counterparty: string | null;
  totalEur: number;
  date: string;
}

interface Props {
  verification: SerializedVerification;
  availableInvoices: AvailableInvoice[];
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  PENDING: { label: "Pendiente", className: "bg-gray-100 text-gray-700" },
  HOURS_CAPTURED: { label: "Horas capturadas", className: "bg-blue-100 text-blue-700" },
  INVOICE_RECEIVED: { label: "Factura recibida", className: "bg-yellow-100 text-yellow-700" },
  PERIOD_MISMATCH: { label: "Período incorrecto", className: "bg-red-100 text-red-700" },
  VERIFIED_MISMATCH: { label: "Importe incorrecto", className: "bg-orange-100 text-orange-700" },
  VERIFIED_OK: { label: "Verificado OK", className: "bg-green-100 text-green-700" },
  APPROVED: { label: "Aprobado", className: "bg-green-600 text-white" },
};

function StatusBadge({ status }: { status: string }): React.JSX.Element {
  const config = STATUS_LABELS[status] ?? { label: status, className: "bg-gray-100 text-gray-700" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}

function fmt(val: number | null): string {
  return val != null ? formatCurrency(val) : "—";
}

function fmtDate(val: string | null): string {
  return val ? formatDate(val) : "—";
}

export function VerificationRow({ verification: v, availableInvoices }: Props): React.JSX.Element {
  const [isPending, startTransition] = useTransition();
  const [showLinkPanel, setShowLinkPanel] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [serviceStart, setServiceStart] = useState("");
  const [serviceEnd, setServiceEnd] = useState("");
  const [notes, setNotes] = useState(v.notes ?? "");
  const [showNotes, setShowNotes] = useState(false);

  const diff = v.invoicedAmount != null && v.expectedAmount != null
    ? v.invoicedAmount - v.expectedAmount
    : null;

  const handleCapture = (): void => {
    startTransition(async () => {
      await captureTempoHours(v.id);
    });
  };

  const handleLinkSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (!selectedInvoiceId || !serviceStart || !serviceEnd) return;
    startTransition(async () => {
      await linkInvoice(v.id, selectedInvoiceId, serviceStart, serviceEnd);
      setShowLinkPanel(false);
    });
  };

  const handleVerify = (): void => {
    startTransition(async () => {
      await verifyPeriod(v.id);
    });
  };

  const handleRelink = (): void => {
    startTransition(async () => {
      await relinkInvoice(v.id);
    });
  };

  const handleApprove = (): void => {
    startTransition(async () => {
      await approveForPayment(v.id);
    });
  };

  const handleSaveNotes = (): void => {
    startTransition(async () => {
      await saveNotes(v.id, notes);
      setShowNotes(false);
    });
  };

  const period = `${fmtDate(v.periodStart)} – ${fmtDate(v.periodEnd)}`;

  return (
    <div className="border-b border-gray-100 last:border-0">
      <div className="grid grid-cols-[2fr_1fr_1fr_1fr_2fr_1fr_1fr_1fr_2fr] gap-2 items-center px-4 py-3 text-sm hover:bg-gray-50">
        {/* Período */}
        <span className="text-gray-700 text-xs">{period}</span>

        {/* Horas aprobadas */}
        <span className="text-gray-700 text-xs text-right">
          {v.tempoHours != null ? `${v.tempoHours} h` : "—"}
          {v.capturedAt && <span className="block text-gray-400 text-xs">{fmtDate(v.capturedAt)}</span>}
        </span>

        {/* Importe esperado */}
        <span className="text-gray-700 text-xs text-right">{fmt(v.expectedAmount)}</span>

        {/* Factura */}
        <span className="text-gray-700 text-xs">
          {v.invoice ? (v.invoice.number ?? v.invoiceId?.slice(0, 8) ?? "—") : "—"}
          {v.invoice?.counterparty && <span className="block text-gray-400">{v.invoice.counterparty}</span>}
        </span>

        {/* Período declarado en factura */}
        <span className="text-xs text-gray-700">
          {v.invoiceServicePeriodStart && v.invoiceServicePeriodEnd
            ? `${fmtDate(v.invoiceServicePeriodStart)} – ${fmtDate(v.invoiceServicePeriodEnd)}`
            : "—"}
        </span>

        {/* Importe facturado */}
        <span className="text-xs text-right text-gray-700">{fmt(v.invoicedAmount)}</span>

        {/* Diferencia */}
        <span className={`text-xs text-right font-medium ${diff != null && Math.abs(diff) > 0.01 ? "text-red-600" : "text-green-600"}`}>
          {diff != null ? fmt(diff) : "—"}
        </span>

        {/* Estado */}
        <StatusBadge status={v.status} />

        {/* Acciones */}
        <div className="flex flex-col gap-1">
          {v.status === "PENDING" && (
            <button
              onClick={handleCapture}
              disabled={isPending}
              className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700 disabled:opacity-50"
            >
              {isPending ? "..." : "Capturar horas"}
            </button>
          )}

          {v.status === "HOURS_CAPTURED" && !showLinkPanel && (
            <button
              onClick={() => setShowLinkPanel(true)}
              className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700"
            >
              Vincular factura
            </button>
          )}

          {v.status === "INVOICE_RECEIVED" && (
            <button
              onClick={handleVerify}
              disabled={isPending}
              className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700 disabled:opacity-50"
            >
              {isPending ? "..." : "Verificar"}
            </button>
          )}

          {(v.status === "PERIOD_MISMATCH" || v.status === "VERIFIED_MISMATCH") && (
            <>
              <button
                onClick={handleRelink}
                disabled={isPending}
                className="text-xs bg-orange-600 text-white px-2 py-1 rounded hover:bg-orange-700 disabled:opacity-50"
              >
                {isPending ? "..." : "Re-vincular factura"}
              </button>
              <button
                onClick={() => setShowNotes((s) => !s)}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Notas
              </button>
            </>
          )}

          {v.status === "VERIFIED_OK" && (
            <button
              onClick={handleApprove}
              disabled={isPending}
              className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 disabled:opacity-50"
            >
              {isPending ? "..." : "Aprobar para pago"}
            </button>
          )}
        </div>
      </div>

      {/* Panel vincular factura */}
      {showLinkPanel && (
        <form onSubmit={handleLinkSubmit} className="px-4 pb-4 pt-1 bg-gray-50 border-t border-gray-100 space-y-3">
          <p className="text-xs font-medium text-gray-700">Selecciona la factura del proveedor</p>
          <select
            value={selectedInvoiceId}
            onChange={(e) => setSelectedInvoiceId(e.target.value)}
            required
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
          >
            <option value="">— Selecciona una factura —</option>
            {availableInvoices.map((inv) => (
              <option key={inv.id} value={inv.id}>
                {inv.number ?? inv.id.slice(0, 8)} · {inv.counterparty ?? "—"} · {formatCurrency(inv.totalEur)} · {fmtDate(inv.date)}
              </option>
            ))}
          </select>

          <div>
            <p className="text-xs font-medium text-gray-700 mb-1">Período de referencia declarado en la factura</p>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={serviceStart}
                onChange={(e) => setServiceStart(e.target.value)}
                required
                className="border border-gray-300 rounded px-2 py-1 text-sm"
              />
              <span className="text-gray-400 text-xs">—</span>
              <input
                type="date"
                value={serviceEnd}
                onChange={(e) => setServiceEnd(e.target.value)}
                required
                className="border border-gray-300 rounded px-2 py-1 text-sm"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-700 disabled:opacity-50"
            >
              {isPending ? "..." : "Vincular"}
            </button>
            <button
              type="button"
              onClick={() => setShowLinkPanel(false)}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Notas */}
      {showNotes && (
        <div className="px-4 pb-3 pt-1 bg-gray-50 border-t border-gray-100">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Notas sobre la discrepancia..."
            className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
          />
          <div className="flex gap-2 mt-1">
            <button
              onClick={handleSaveNotes}
              disabled={isPending}
              className="text-xs bg-gray-600 text-white px-2 py-1 rounded hover:bg-gray-700 disabled:opacity-50"
            >
              {isPending ? "..." : "Guardar nota"}
            </button>
            <button onClick={() => setShowNotes(false)} className="text-xs text-gray-500">Cancelar</button>
          </div>
        </div>
      )}

      {/* Warning nota de fallback */}
      {v.notes && v.status !== "PERIOD_MISMATCH" && v.status !== "VERIFIED_MISMATCH" && (
        <div className="px-4 pb-2 text-xs text-amber-700 bg-amber-50 border-t border-amber-100">
          {v.notes}
        </div>
      )}
    </div>
  );
}
