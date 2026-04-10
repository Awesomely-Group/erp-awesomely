"use client";

import { useState, useTransition } from "react";
import { Pencil, Check, X } from "lucide-react";
import { MARCA_OPTIONS } from "@/lib/org";
import { updateInvoiceMarca } from "./actions";

interface Props {
  invoiceId: string;
  marca: string | null;
}

export function MarcaEditor({ invoiceId, marca: initialMarca }: Props): React.JSX.Element {
  const [editing, setEditing] = useState(false);
  const [marca, setMarca] = useState(initialMarca ?? "");
  const [isPending, startTransition] = useTransition();

  function handleSave(): void {
    startTransition(async () => {
      await updateInvoiceMarca({ invoiceId, marca: marca || null });
      setEditing(false);
    });
  }

  function handleCancel(): void {
    setMarca(initialMarca ?? "");
    setEditing(false);
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <select
          value={marca}
          onChange={(e) => setMarca(e.target.value)}
          disabled={isPending}
          autoFocus
          className="rounded-md border border-gray-300 px-2 py-0.5 text-sm bg-white text-gray-700"
        >
          <option value="">Sin marca</option>
          {MARCA_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
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

  return (
    <span className="inline-flex items-center gap-1">
      {marca || <span className="text-gray-400 italic">Sin marca</span>}
      <button
        onClick={() => setEditing(true)}
        className="p-0.5 rounded text-gray-300 hover:text-gray-500 transition-colors"
        title="Editar marca"
      >
        <Pencil className="h-3 w-3" />
      </button>
    </span>
  );
}
