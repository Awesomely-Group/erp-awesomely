"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, X } from "lucide-react";
import { updateInvoiceRecurrence } from "./actions";

const RECURRENCE_OPTIONS = [
  { value: "PUNTUAL",        label: "Puntual" },
  { value: "MENSUAL",        label: "Mensual" },
  { value: "ANUAL",          label: "Anual" },
  { value: "EXTRAORDINARIO", label: "Extraordinario" },
] as const;

const RECURRENCE_COLORS: Record<string, string> = {
  PUNTUAL:        "bg-blue-100 text-blue-700",
  MENSUAL:        "bg-green-100 text-green-700",
  ANUAL:          "bg-purple-100 text-purple-700",
  EXTRAORDINARIO: "bg-amber-100 text-amber-700",
};

interface Props {
  invoiceId: string;
  recurrence: string | null;
}

export function RecurrenceEditor({ invoiceId, recurrence }: Props): React.JSX.Element {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(recurrence ?? "");
  const [isPending, startTransition] = useTransition();

  function handleSave(): void {
    startTransition(async () => {
      await updateInvoiceRecurrence({ invoiceId, recurrence: value || null });
      setEditing(false);
      router.refresh();
    });
  }

  function handleCancel(): void {
    setValue(recurrence ?? "");
    setEditing(false);
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <select
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={isPending}
          autoFocus
          className="rounded-md border border-gray-300 px-2 py-0.5 text-xs bg-white text-gray-700"
        >
          <option value="">— Sin asignar —</option>
          {RECURRENCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
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

  const option = RECURRENCE_OPTIONS.find((o) => o.value === recurrence);

  return (
    <span className="inline-flex items-center gap-1">
      {option ? (
        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${RECURRENCE_COLORS[option.value]}`}>
          {option.label}
        </span>
      ) : (
        <span className="text-gray-400 text-xs">—</span>
      )}
      <button
        onClick={() => setEditing(true)}
        className="p-0.5 rounded text-gray-300 hover:text-gray-500 transition-colors"
        title="Editar recurrencia"
      >
        <Pencil className="h-3 w-3" />
      </button>
    </span>
  );
}
