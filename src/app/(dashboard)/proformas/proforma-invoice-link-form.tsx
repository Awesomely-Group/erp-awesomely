"use client";

import { useState, useTransition } from "react";
import { InvoiceCombobox } from "@/components/invoice-combobox";
import { linkProformaToInvoice } from "./actions";

interface Props {
  proformaId: string;
  companyId: string;
  contactId: string | null;
  initialInvoiceId: string | null;
}

export function ProformaInvoiceLinkForm({
  proformaId,
  companyId,
  contactId,
  initialInvoiceId,
}: Props): React.JSX.Element {
  const [invoiceId, setInvoiceId] = useState(initialInvoiceId);
  const [isPending, startTransition] = useTransition();

  function handleChange(id: string | null): void {
    setInvoiceId(id);
    startTransition(async () => {
      await linkProformaToInvoice(proformaId, id);
    });
  }

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
        Factura vinculada
      </h3>
      <InvoiceCombobox
        companyId={companyId}
        contactId={contactId ?? undefined}
        value={invoiceId}
        onChange={handleChange}
        disabled={isPending}
      />
      <p className="text-xs text-gray-400">
        Vincula manualmente esta proforma a la factura en la que se convirtió, si no se ha
        detectado automáticamente.
      </p>
    </div>
  );
}
