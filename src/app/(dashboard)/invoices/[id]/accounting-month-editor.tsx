"use client";

import { useState, useTransition } from "react";
import { Pencil, Check, X } from "lucide-react";
import { updateInvoiceAccountingMonth } from "./actions";

interface Props {
  invoiceId: string;
  accountingMonth: Date | null;
  invoiceDate: Date;
}

function toMonthInput(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function formatMonth(date: Date): string {
  return date.toLocaleDateString("es-ES", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function AccountingMonthEditor({
  invoiceId,
  accountingMonth,
  invoiceDate,
}: Props): React.JSX.Element {
  const effectiveDate = accountingMonth ?? invoiceDate;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(toMonthInput(effectiveDate));
  const [isPending, startTransition] = useTransition();

  function handleSave(): void {
    startTransition(async () => {
      await updateInvoiceAccountingMonth({ invoiceId, month: value });
      setEditing(false);
    });
  }

  function handleCancel(): void {
    setValue(toMonthInput(effectiveDate));
    setEditing(false);
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <input
          type="month"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={isPending}
          autoFocus
          className="rounded-md border border-gray-300 px-2 py-0.5 text-sm bg-white text-gray-700"
        />
        <button
          onClick={handleSave}
          disabled={isPending}
          className="p-0.5 rounded text-green-600 hover:text-green-700 disabled:opacity-40"
          title="Guardar"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleCancel}
          disabled={isPending}
          className="p-0.5 rounded text-gray-400 hover:text-gray-600"
          title="Cancelar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <span className={accountingMonth ? "text-gray-700" : "text-gray-400"}>
        {formatMonth(effectiveDate)}
        {!accountingMonth && <span className="text-gray-300 ml-1">(por defecto)</span>}
      </span>
      <button
        onClick={() => setEditing(true)}
        className="p-0.5 rounded text-gray-300 hover:text-gray-500 transition-colors"
        title="Editar mes de referencia"
      >
        <Pencil className="h-3 w-3" />
      </button>
    </span>
  );
}
