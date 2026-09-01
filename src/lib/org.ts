import { Prisma } from "@prisma/client";

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
 * Orden en el que se agrupa el selector de cuenta contable (plan 28-ago, F2
 * redefinido): solo estas tres categorías tienen cabecera propia, en este orden —
 * el resto (REVENUE, AMORT, sin categoría…) va después bajo `OTHER_ACCOUNTS_LABEL`
 * para no esconder cuentas que no encajan, mismo criterio que el resto de la app.
 */
export const ACCOUNT_L1_GROUP_ORDER = ["OPEX", "CAPEX", "COGS"] as const;
export const OTHER_ACCOUNTS_LABEL = "Otras cuentas";

/** Agrupa cuentas contables por `l1`, en `ACCOUNT_L1_GROUP_ORDER` y luego el resto. */
export function groupAccountsByL1<T extends { l1: string | null }>(
  accounts: T[]
): { label: string; items: T[] }[] {
  const byL1 = new Map<string, T[]>();
  for (const account of accounts) {
    const key = account.l1 ?? OTHER_ACCOUNTS_LABEL;
    const list = byL1.get(key);
    if (list) list.push(account);
    else byL1.set(key, [account]);
  }

  const groups: { label: string; items: T[] }[] = [];
  for (const l1 of ACCOUNT_L1_GROUP_ORDER) {
    const items = byL1.get(l1);
    if (items?.length) groups.push({ label: l1, items });
    byL1.delete(l1);
  }
  for (const [label, items] of byL1) {
    groups.push({ label, items });
  }
  return groups;
}

/**
 * Estado de selección de un grupo de cuentas contables en el multiselect de
 * "Cuenta contable" (Cashflow) — permite pintar el checkbox de cabecera del grupo
 * como marcado, sin marcar o `indeterminate`.
 */
export function accountGroupSelectionState<T extends { num: string }>(
  items: T[],
  selectedAccounts: string[]
): { allSelected: boolean; someSelected: boolean } {
  if (items.length === 0) return { allSelected: false, someSelected: false };
  const selected = new Set(selectedAccounts);
  const selectedCount = items.filter((a) => selected.has(a.num)).length;
  return {
    allSelected: selectedCount === items.length,
    someSelected: selectedCount > 0 && selectedCount < items.length,
  };
}

/**
 * Añade o quita todos los `num` de un grupo de `selectedAccounts` en un solo toggle:
 * si el grupo está completo o parcialmente seleccionado, lo deselecciona entero;
 * si no tiene ninguno seleccionado, lo selecciona entero. Preserva la selección de
 * cuentas de otros grupos.
 */
export function toggleAccountGroup<T extends { num: string }>(
  selectedAccounts: string[],
  groupItems: T[]
): string[] {
  const groupNums = new Set(groupItems.map((a) => a.num));
  const { allSelected, someSelected } = accountGroupSelectionState(groupItems, selectedAccounts);
  if (allSelected || someSelected) {
    return selectedAccounts.filter((num) => !groupNums.has(num));
  }
  const rest = selectedAccounts.filter((num) => !groupNums.has(num));
  return [...rest, ...groupItems.map((a) => a.num)];
}

/** Filtra proyectos según la marca seleccionada (workspace.name === marca). */
export function filterProjectsByMarca<T extends { workspaceName: string }>(
  projects: T[],
  marca: string | null
): T[] {
  if (!marca) return projects;
  return projects.filter((p) => p.workspaceName === marca);
}

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

export function proformaWhereMarca(
  marca?: string
): Prisma.ProformaWhereInput | undefined {
  if (!marca) return undefined;

  const values = marca.split(",").filter(Boolean);
  if (values.length === 0) return undefined;

  const includesUnassigned = values.includes(MARCA_FILTER_UNASSIGNED);
  const marcaValues = values.filter((v) => v !== MARCA_FILTER_UNASSIGNED && MARCA_VALUES.has(v));

  const conditions: Prisma.ProformaWhereInput[] = [];

  if (includesUnassigned) conditions.push({ marca: null });

  for (const m of marcaValues) {
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

/**
 * Condiciones SQL crudas de marca + entidad legal, para las consultas `$queryRaw`
 * del gráfico de cashflow (proformas y forecasts) que no pueden usar
 * `invoiceWhereMarca`/`proformaWhereMarca` porque no arman un `where` de Prisma.
 *
 * Existe para no repetir esta lógica en cada consulta: la teníamos duplicada a mano
 * en `cashflow-data.ts` y la copia de las proformas se quedó sin el filtro de
 * `companyId` (F1, plan 28-ago) — una proforma de otra entidad legal se colaba en el
 * gráfico de cualquier filtro. Una sola función compartida no puede volver a
 * desincronizarse así.
 */
export function cashflowScopeConditions({
  marca,
  company,
  marcaColumn = "marca",
  companyColumn = '"companyId"',
}: {
  marca?: string;
  company?: string;
  /** Columna de marca, con alias de tabla si hace falta (p.ej. `i.marca`). */
  marcaColumn?: string;
  /** Columna de entidad legal, con alias de tabla si hace falta. */
  companyColumn?: string;
}): Prisma.Sql[] {
  const conditions: Prisma.Sql[] = [];

  const marcaList = marca?.split(",").filter(Boolean) ?? [];
  if (marcaList.length > 0) {
    const hasUnassigned = marcaList.includes(MARCA_FILTER_UNASSIGNED);
    const namedMarcas = marcaList.filter((m) => m !== MARCA_FILTER_UNASSIGNED);
    const marcaConditions: Prisma.Sql[] = [];
    if (hasUnassigned) marcaConditions.push(Prisma.sql`${Prisma.raw(marcaColumn)} IS NULL`);
    if (namedMarcas.length > 0) {
      marcaConditions.push(
        Prisma.sql`${Prisma.raw(marcaColumn)} IN (${Prisma.join(namedMarcas.map((m) => Prisma.sql`${m}`))})`
      );
    }
    if (marcaConditions.length === 1) conditions.push(marcaConditions[0]);
    else if (marcaConditions.length > 1) conditions.push(Prisma.sql`(${Prisma.join(marcaConditions, " OR ")})`);
  }

  if (company) conditions.push(Prisma.sql`${Prisma.raw(companyColumn)} = ${company}`);

  return conditions;
}
