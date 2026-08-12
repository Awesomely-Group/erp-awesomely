"use client";

import { SearchableSelect } from "@/components/searchable-select";

export type AccountMappingOption = {
  id: string;
  description: string;
  l1: string;
};

export type SupplierOption = {
  id: string;
  name: string;
};

const L1_LABELS: Record<string, string> = {
  COGS: "COGS",
  OPEX: "Opex",
  CAPEX: "Capex",
};

/**
 * Selector de cuenta contable con buscador: busca por categoría (COGS/Opex/Capex) y por
 * nombre de cuenta a la vez. El valor final se envía en el campo `name="accountMappingId"`.
 */
export function AccountMappingSelect({
  accountMappings,
  defaultAccountMappingId,
}: {
  accountMappings: AccountMappingOption[];
  defaultAccountMappingId?: string | null;
}): React.JSX.Element {
  const options = accountMappings.map((a) => ({
    id: a.id,
    label: a.description,
    sublabel: L1_LABELS[a.l1] ?? a.l1,
  }));

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-600">Cuenta contable *</label>
      <SearchableSelect
        name="accountMappingId"
        options={options}
        defaultValue={defaultAccountMappingId}
        placeholder="Busca por categoría o nombre de cuenta…"
        emptyMessage="Sin cuentas que coincidan"
      />
    </div>
  );
}

/** Selector de proveedor opcional con buscador (`name="supplierId"`). */
export function SupplierSelect({
  suppliers,
  defaultSupplierId,
}: {
  suppliers: SupplierOption[];
  defaultSupplierId?: string | null;
}): React.JSX.Element {
  const options = suppliers.map((s) => ({ id: s.id, label: s.name }));

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-600">Proveedor</label>
      <SearchableSelect
        name="supplierId"
        options={options}
        defaultValue={defaultSupplierId}
        placeholder="Buscar proveedor…"
        clearLabel="Sin proveedor"
        emptyMessage="Sin proveedores que coincidan"
      />
    </div>
  );
}
