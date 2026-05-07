"use client";

import { useTransition } from "react";
import { type SupplierEntidad } from "@prisma/client";
import { updateSupplierEntidad } from "./actions";

interface Props {
  supplierId: string;
  entidad: SupplierEntidad | null;
}

const LABELS: Record<SupplierEntidad, string> = {
  AWESOMELY_SL: "Awesomely SL",
  AWESOMELY_OU: "Awesomely OU",
};

export function SupplierEntidadSelect({ supplierId, entidad }: Props): React.JSX.Element {
  const [isPending, startTransition] = useTransition();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const value = e.target.value as SupplierEntidad | "";
    startTransition(async () => {
      await updateSupplierEntidad(supplierId, value);
    });
  };

  return (
    <select
      value={entidad ?? ""}
      onChange={handleChange}
      disabled={isPending}
      className="rounded border border-gray-200 px-2 py-1 text-xs bg-white text-gray-700 disabled:opacity-50 hover:border-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
    >
      <option value="">—</option>
      {(Object.keys(LABELS) as SupplierEntidad[]).map((k) => (
        <option key={k} value={k}>{LABELS[k]}</option>
      ))}
    </select>
  );
}
