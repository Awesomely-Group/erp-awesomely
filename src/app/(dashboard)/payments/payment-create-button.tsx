"use client";

import { useState } from "react";
import { type AccountMappingOption } from "@/app/(dashboard)/forecasts/forecast-classification-fields";
import { PaymentForm } from "./payment-form";

interface Props {
  /** Fijado según la pestaña activa — Pagos → EXPENSE, Cobros → INCOME. */
  direction: "INCOME" | "EXPENSE";
  invoiceOptions: { id: string; label: string; sublabel?: string }[];
  accountMappings: AccountMappingOption[];
  companyOptions: { id: string; name: string }[];
}

/** Botón "Registrar pago" que abre el modal de creación (`PaymentForm`), ya escopado a la
 * dirección/tipo de factura de la pestaña activa. */
export function PaymentCreateButton({
  direction,
  invoiceOptions,
  accountMappings,
  companyOptions,
}: Props): React.JSX.Element {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
      >
        + Registrar pago
      </button>
      {open && (
        <PaymentForm
          direction={direction}
          invoiceOptions={invoiceOptions}
          accountMappings={accountMappings}
          companyOptions={companyOptions}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
