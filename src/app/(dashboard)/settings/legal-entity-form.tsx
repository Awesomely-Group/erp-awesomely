"use client";

import { useState, useTransition } from "react";
import { createLegalEntity } from "./actions";
import { Plus } from "lucide-react";

export function LegalEntityForm(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(async () => {
      await createLegalEntity(data);
      e.currentTarget.reset();
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
      >
        <Plus className="h-4 w-4" /> Nueva entidad legal
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-xl border border-gray-200 p-5 space-y-4"
    >
      <h3 className="font-medium text-gray-900">Alta de entidad legal</h3>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Nombre (p. ej. Awesomely Holding SL)
        </label>
        <input
          name="name"
          required
          placeholder="Nombre de la entidad"
          className="w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors"
        >
          Guardar
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
