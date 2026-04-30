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

/**
 * Filtro Prisma por invoice.marca.
 * Acepta un string con uno o varios valores separados por coma
 * (e.g. "Gigson,LaTroupe"). El campo marca en BD puede también contener
 * múltiples valores separados por coma cuando una factura pertenece a varias marcas.
 */
export function invoiceWhereMarca(
  marca?: string
): Prisma.InvoiceWhereInput | undefined {
  if (!marca) return undefined;

  const values = marca.split(",").filter(Boolean);
  if (values.length === 0) return undefined;

  const includesUnassigned = values.includes(MARCA_FILTER_UNASSIGNED);
  const marcaValues = values.filter((v) => v !== MARCA_FILTER_UNASSIGNED && MARCA_VALUES.has(v));

  const conditions: Prisma.InvoiceWhereInput[] = [];

  if (includesUnassigned) conditions.push({ marca: null });

  for (const m of marcaValues) {
    // Match exact value OR value as part of a comma-separated list stored in the field
    conditions.push({
      OR: [
        { marca: m },
        { marca: { startsWith: `${m},` } },
        { marca: { contains: `,${m},` } },
        { marca: { endsWith: `,${m}` } },
      ],
    });
  }

  if (conditions.length === 0) return undefined;
  return { OR: conditions };
}
