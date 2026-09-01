"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { type PaymentDirection } from "@prisma/client";
import { MARCA_OPTIONS } from "@/lib/org";
import { SearchableSelect } from "@/components/searchable-select";
import {
  AccountMappingSelect,
  type AccountMappingOption,
} from "@/app/(dashboard)/forecasts/forecast-classification-fields";
import { createManualPayment } from "./actions";

interface Props {
  /** Fijado según la pestaña activa (Pagos → EXPENSE, Cobros → INCOME) — no editable aquí. */
  direction: PaymentDirection;
  /** Facturas del tipo correspondiente a `direction` (PURCHASE para EXPENSE, SALE para
   * INCOME), incluidas las ya pagadas del todo (para correcciones/excesos de pago). */
  invoiceOptions: { id: string; label: string; sublabel?: string }[];
  accountMappings: AccountMappingOption[];
  companyOptions: { id: string; name: string }[];
  onClose: () => void;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function PaymentForm({
  direction,
  invoiceOptions,
  accountMappings,
  companyOptions,
  onClose,
}: Props): React.JSX.Element {
  const [unlinked, setUnlinked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const isExpense = direction === "EXPENSE";

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    const invoiceId = unlinked ? null : (fd.get("invoiceId") as string) || null;
    const accountMappingId = (fd.get("accountMappingId") as string) || null;
    const marca = (fd.get("marca") as string) || null;
    const companyId = (fd.get("companyId") as string) || null;
    const amount = parseFloat(fd.get("amount") as string);
    const paidAt = fd.get("paidAt") as string;
    const notes = (fd.get("notes") as string) || "";

    if (!unlinked && !invoiceId) {
      setError("Selecciona una factura, o marca “Sin factura asociada”.");
      return;
    }
    if (unlinked && !accountMappingId) {
      setError("La cuenta contable es obligatoria para pagos sin factura asociada.");
      return;
    }
    if (isNaN(amount) || !paidAt) {
      setError("Indica un importe y una fecha válidos.");
      return;
    }

    setError(null);
    startTransition(async () => {
      await createManualPayment({
        invoiceId,
        direction,
        amount,
        paidAt,
        notes,
        companyId: unlinked ? companyId : null,
        marca: unlinked ? marca : null,
        accountMappingId: unlinked ? accountMappingId : null,
      });
      router.refresh();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900">
            Registrar {isExpense ? "pago" : "cobro"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={unlinked}
              onChange={(e) => setUnlinked(e.target.checked)}
              className="rounded border-gray-300"
            />
            Sin factura asociada
          </label>

          {!unlinked ? (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">Factura *</label>
              <SearchableSelect
                name="invoiceId"
                options={invoiceOptions}
                placeholder="Busca por cliente/proveedor o número…"
                emptyMessage="Sin facturas que coincidan"
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <AccountMappingSelect accountMappings={accountMappings} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-600">Marca</label>
                <select
                  name="marca"
                  defaultValue=""
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
                >
                  <option value="">Sin marca</option>
                  {MARCA_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-600">Empresa</label>
                <select
                  name="companyId"
                  defaultValue=""
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
                >
                  <option value="">Sin empresa</option>
                  {companyOptions.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">Importe (EUR) *</label>
              <input
                type="number"
                name="amount"
                step="0.01"
                required
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">Fecha *</label>
              <input
                type="date"
                name="paidAt"
                required
                defaultValue={todayIso()}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">Notas (opcional)</label>
            <input
              type="text"
              name="notes"
              placeholder="Referencia, comentario…"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {pending ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
