"use client";

import { useState } from "react";

export type AccountMappingOption = {
  id: string;
  description: string;
  l1: string;
};

export type SupplierOption = {
  id: string;
  name: string;
};

const ACCOUNT_CATEGORY_OPTIONS = [
  { value: "COGS", label: "COGS" },
  { value: "OPEX", label: "Opex" },
  { value: "CAPEX", label: "Capex" },
];

/**
 * Selector de cuenta contable en dos niveles: categoría (COGS/Opex/Capex) → cuenta
 * específica de `AccountMapping` filtrada por esa categoría. El valor final se envía en
 * el campo de formulario `name="accountMappingId"`.
 */
export function AccountMappingSelect({
  accountMappings,
  defaultAccountMappingId,
}: {
  accountMappings: AccountMappingOption[];
  defaultAccountMappingId?: string | null;
}): React.JSX.Element {
  const defaultMapping = accountMappings.find((a) => a.id === defaultAccountMappingId) ?? null;
  const [category, setCategory] = useState<string>(defaultMapping?.l1 ?? "");
  const filtered = accountMappings.filter((a) => a.l1 === category);

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-600">Categoría cuenta *</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          required
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
        >
          <option value="">Selecciona…</option>
          {ACCOUNT_CATEGORY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-600">Cuenta *</label>
        <select
          name="accountMappingId"
          required
          defaultValue={defaultAccountMappingId ?? ""}
          disabled={!category}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white disabled:bg-gray-50 disabled:text-gray-400"
        >
          <option value="">{category ? "Selecciona cuenta…" : "Elige categoría primero"}</option>
          {filtered.map((a) => (
            <option key={a.id} value={a.id}>{a.description}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

/** Selector de proveedor opcional (`name="supplierId"`). */
export function SupplierSelect({
  suppliers,
  defaultSupplierId,
}: {
  suppliers: SupplierOption[];
  defaultSupplierId?: string | null;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-600">Proveedor</label>
      <select
        name="supplierId"
        defaultValue={defaultSupplierId ?? ""}
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
      >
        <option value="">Sin proveedor</option>
        {suppliers.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
    </div>
  );
}
