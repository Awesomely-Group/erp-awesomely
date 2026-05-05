"use client";

import { useTransition } from "react";
import { type SupplierTipo } from "@prisma/client";
import { updateSupplierTipo } from "./actions";

interface Props {
  supplierId: string;
  tipo: SupplierTipo | null;
}

const LABELS: Record<SupplierTipo, string> = {
  SERVICIOS: "Servicios",
  HERRAMIENTAS: "Herramientas",
};

export function SupplierTipoSelect({ supplierId, tipo }: Props): React.JSX.Element {
  const [isPending, startTransition] = useTransition();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const value = e.target.value as SupplierTipo | "";
    startTransition(async () => {
      await updateSupplierTipo(supplierId, value);
    });
  };

  return (
    <select
      value={tipo ?? ""}
      onChange={handleChange}
      disabled={isPending}
      className="rounded border border-gray-200 px-2 py-1 text-xs bg-white text-gray-700 disabled:opacity-50 hover:border-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
    >
      <option value="">—</option>
      {(Object.keys(LABELS) as SupplierTipo[]).map((k) => (
        <option key={k} value={k}>{LABELS[k]}</option>
      ))}
    </select>
  );
}
