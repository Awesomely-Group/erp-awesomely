/** Shared column definitions for the invoices table. */

export const OPTIONAL_COLUMN_KEYS = [
  "companyName",
  "brand",
  "accountingMonth",
  "date",
  "subtotal",
  "total",
  "totalEur",
  "holdedStatus",
  "status",
  "recurrence",
] as const;

export type ColumnKey = (typeof OPTIONAL_COLUMN_KEYS)[number];

export const OPTIONAL_COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: "companyName",     label: "Entidad Legal" },
  { key: "brand",           label: "Marca" },
  { key: "accountingMonth", label: "Mes Referencia" },
  { key: "date",            label: "Fecha" },
  { key: "subtotal",        label: "Base imp." },
  { key: "total",           label: "Total" },
  { key: "totalEur",        label: "Total (EUR)" },
  { key: "holdedStatus",    label: "Estado Holded" },
  { key: "status",          label: "Estado" },
  { key: "recurrence",      label: "Recurrencia" },
];

/** Parse the `cols` URL param into a Set of visible column keys.
 *  If the param is absent or empty, all columns are visible. */
export function parseVisibleCols(raw: string | undefined): Set<ColumnKey> {
  if (!raw) return new Set(OPTIONAL_COLUMNS.map((c) => c.key));
  const keys = raw
    .split(",")
    .filter((k): k is ColumnKey => OPTIONAL_COLUMN_KEYS.includes(k as ColumnKey));
  return keys.length > 0
    ? new Set(keys)
    : new Set(OPTIONAL_COLUMNS.map((c) => c.key));
}
