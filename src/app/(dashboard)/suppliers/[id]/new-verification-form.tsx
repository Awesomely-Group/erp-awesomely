"use client";

import { useState, useTransition } from "react";
import { createVerification } from "./actions";

interface Props {
  supplierId: string;
}

export function NewVerificationForm({ supplierId }: Props): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (!periodStart || !periodEnd) return;
    startTransition(async () => {
      await createVerification(supplierId, periodStart, periodEnd);
      setOpen(false);
      setPeriodStart("");
      setPeriodEnd("");
    });
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700"
      >
        + Nuevo período
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-4 py-3">
      <span className="text-sm font-medium text-gray-700">Período:</span>
      <input
        type="date"
        value={periodStart}
        onChange={(e) => setPeriodStart(e.target.value)}
        required
        className="border border-gray-300 rounded px-2 py-1 text-sm"
      />
      <span className="text-gray-400 text-sm">—</span>
      <input
        type="date"
        value={periodEnd}
        onChange={(e) => setPeriodEnd(e.target.value)}
        required
        className="border border-gray-300 rounded px-2 py-1 text-sm"
      />
      <button
        type="submit"
        disabled={isPending}
        className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-700 disabled:opacity-50"
      >
        {isPending ? "Creando..." : "Crear"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-sm text-gray-500 hover:text-gray-700"
      >
        Cancelar
      </button>
    </form>
  );
}
