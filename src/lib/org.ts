import type { Prisma } from "@prisma/client";

/** Marca comercial del grupo — valores legibles mapeados desde tags de Holded. */
export const MARCA_OPTIONS: { value: string; label: string }[] = [
  { value: "Gigson Solutions", label: "Gigson Solutions" },
  { value: "Gigson", label: "Gigson" },
  { value: "Awesomely", label: "Awesomely" },
  { value: "LaTroupe", label: "LaTroupe" },
];

/** Valor de query param para filtrar facturas sin marca (`invoice.marca` null). */
export const MARCA_FILTER_UNASSIGNED = "__unassigned__";

/** Estado: pendiente o parcial de clasificación (sin terminar de asignar proyecto). */
export const STATUS_FILTER_UNASSIGNED = "__status_unassigned__";

const MARCA_VALUES = new Set(MARCA_OPTIONS.map((o) => o.value));

/** Filtro Prisma por invoice.marca (valor conocido o sin asignar). */
export function invoiceWhereMarca(
  marca?: string
): Prisma.InvoiceWhereInput | undefined {
  if (!marca) return undefined;
  if (marca === MARCA_FILTER_UNASSIGNED) {
    return { marca: null };
  }
  if (MARCA_VALUES.has(marca)) {
    return { marca };
  }
  return undefined;
}
