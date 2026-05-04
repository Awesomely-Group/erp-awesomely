"use client";

import { useState, useTransition } from "react";
import { updateSupplierData } from "./actions";

interface Props {
  supplierId: string;
  jiraAccountId: string | null;
  hourlyRate: number | null;
}

export function SupplierEnrichForm({ supplierId, jiraAccountId, hourlyRate }: Props): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [jira, setJira] = useState(jiraAccountId ?? "");
  const [rate, setRate] = useState(hourlyRate != null ? String(hourlyRate) : "");
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    startTransition(async () => {
      await updateSupplierData(supplierId, jira, rate);
      setOpen(false);
    });
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
      >
        Editar
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        type="text"
        value={jira}
        onChange={(e) => setJira(e.target.value)}
        placeholder="Jira Account ID"
        className="border border-gray-300 rounded px-2 py-1 text-xs w-36"
      />
      <input
        type="number"
        value={rate}
        onChange={(e) => setRate(e.target.value)}
        placeholder="€/h"
        step="0.01"
        min="0"
        className="border border-gray-300 rounded px-2 py-1 text-xs w-20"
      />
      <button
        type="submit"
        disabled={isPending}
        className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700 disabled:opacity-50"
      >
        {isPending ? "..." : "Guardar"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-xs text-gray-500 hover:text-gray-700"
      >
        Cancelar
      </button>
    </form>
  );
}
