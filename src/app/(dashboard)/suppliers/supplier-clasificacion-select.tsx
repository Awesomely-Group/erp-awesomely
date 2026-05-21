"use client";

import { useTransition } from "react";
import { updateSupplierIsPartner } from "./actions";

interface Props {
  supplierId: string;
  isPartner: boolean;
}

export function SupplierClasificacionSelect({ supplierId, isPartner }: Props): React.JSX.Element {
  const [isPending, startTransition] = useTransition();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const value = e.target.value === "partner";
    startTransition(async () => {
      await updateSupplierIsPartner(supplierId, value);
    });
  };

  return (
    <select
      value={isPartner ? "partner" : "proveedor"}
      onChange={handleChange}
      disabled={isPending}
      className="rounded border border-gray-200 px-2 py-1 text-xs bg-white text-gray-700 disabled:opacity-50 hover:border-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
    >
      <option value="proveedor">Proveedor</option>
      <option value="partner">Partner</option>
    </select>
  );
}
