import {
  ACCOUNT_L1_GROUP_ORDER,
  OTHER_ACCOUNTS_LABEL,
  MARCA_OPTIONS,
  entitySystemFromCompanyName,
  formatAccountNamePair,
} from "@/lib/org";
import type { ForecastAccountRow } from "@/lib/cashflow-data";

/** Etiquetas legibles de `l1`, mismo mapeo que se usaba antes en la tabla plana. */
const L1_LABELS: Record<string, string> = {
  REVENUE: "Revenue",
  COGS: "COGS",
  OPEX: "Opex",
  CAPEX: "CAPEX",
  AMORT: "Amortización",
};

/** Orden de `l1`: las 3 categorías principales, luego el resto (mismo criterio que
 * el resto de la app vía `ACCOUNT_L1_GROUP_ORDER`), sin duplicar este array en cada
 * componente que agrupe cuentas contables. */
const L1_GROUP_ORDER = [...ACCOUNT_L1_GROUP_ORDER, "REVENUE", "AMORT", OTHER_ACCOUNTS_LABEL];

const SIN_ENTIDAD_LABEL = "Sin entidad";
const SIN_MARCA_LABEL = "Sin marca";

const MARCA_ORDER = MARCA_OPTIONS.map((o) => o.value);

export type CuentaLeaf = {
  key: string;
  accountMappingId: string;
  /** "número · nombre" específico de la entidad bajo la que cuelga, con fallback a
   * la descripción genérica si no hay número/nombre de esa entidad. */
  label: string;
  estimado: number;
  real: number;
  pendiente: number;
};

export type MarcaGroup = {
  key: string;
  marca: string;
  estimado: number;
  real: number;
  pendiente: number;
  cuentas: CuentaLeaf[];
};

export type EntidadGroup = {
  key: string;
  companyId: string | null;
  companyName: string;
  estimado: number;
  real: number;
  pendiente: number;
  marcas: MarcaGroup[];
};

export type L1Group = {
  key: string;
  l1: string;
  label: string;
  estimado: number;
  real: number;
  pendiente: number;
  entidades: EntidadGroup[];
};

function marcaSortIndex(marca: string): number {
  if (marca === SIN_MARCA_LABEL) return MARCA_ORDER.length + 1;
  const idx = MARCA_ORDER.indexOf(marca);
  return idx === -1 ? MARCA_ORDER.length : idx;
}

/** Etiqueta de la fila hoja: número + nombre de cuenta específicos del sistema
 * contable (SL/OU) de la entidad bajo la que cuelga esta hoja, con fallback al
 * nombre combinado o a la descripción genérica si no se puede determinar el
 * sistema (p.ej. grupo "Sin entidad", o un nombre de entidad que no siga la
 * convención de sufijo "SL"/"OÜ"). */
function buildAccountLabel(row: ForecastAccountRow, companyName: string): string {
  const system = entitySystemFromCompanyName(companyName);
  if (system === "SL" && (row.accountNumSL || row.accountNameSL)) {
    return formatLeaf(row.accountNumSL, row.accountNameSL ?? row.description);
  }
  if (system === "OU" && (row.accountNumOU || row.accountNameOU)) {
    return formatLeaf(row.accountNumOU, row.accountNameOU ?? row.description);
  }
  return formatAccountNamePair(row.accountNameSL, row.accountNameOU) ?? row.description;
}

function formatLeaf(num: string | null, name: string): string {
  return num ? `${num} · ${name}` : name;
}

type MutableMarca = { key: string; marca: string; estimado: number; real: number; cuentas: CuentaLeaf[] };
type MutableEntidad = {
  key: string;
  companyId: string | null;
  companyName: string;
  estimado: number;
  real: number;
  marcas: Map<string, MutableMarca>;
};
type MutableL1 = { key: string; l1: string; estimado: number; real: number; entidades: Map<string, MutableEntidad> };

/**
 * Construye el árbol de 4 niveles (Grupo de cuenta → Entidad → Marca → Cuenta) a
 * partir de las filas planas de `getForecastAccountsTable`, con sumas agregadas de
 * abajo hacia arriba en cada nivel. `pendiente` se recalcula como
 * `estimado - real` en cada nivel (no se suma directamente) para no arrastrar
 * redondeos.
 */
export function buildForecastAccountsTree(rows: ForecastAccountRow[]): L1Group[] {
  const l1Map = new Map<string, MutableL1>();

  for (const row of rows) {
    const l1Key = row.l1 || OTHER_ACCOUNTS_LABEL;
    let l1Group = l1Map.get(l1Key);
    if (!l1Group) {
      l1Group = { key: l1Key, l1: l1Key, estimado: 0, real: 0, entidades: new Map() };
      l1Map.set(l1Key, l1Group);
    }

    const entidadKey = `${l1Key}|${row.companyId ?? ""}`;
    let entidadGroup = l1Group.entidades.get(entidadKey);
    if (!entidadGroup) {
      entidadGroup = {
        key: entidadKey,
        companyId: row.companyId,
        companyName: row.companyName ?? SIN_ENTIDAD_LABEL,
        estimado: 0,
        real: 0,
        marcas: new Map(),
      };
      l1Group.entidades.set(entidadKey, entidadGroup);
    }

    const marcaKey = `${entidadKey}|${row.marca ?? ""}`;
    let marcaGroup = entidadGroup.marcas.get(marcaKey);
    if (!marcaGroup) {
      marcaGroup = { key: marcaKey, marca: row.marca ?? SIN_MARCA_LABEL, estimado: 0, real: 0, cuentas: [] };
      entidadGroup.marcas.set(marcaKey, marcaGroup);
    }

    marcaGroup.cuentas.push({
      key: `${marcaKey}|${row.accountMappingId}`,
      accountMappingId: row.accountMappingId,
      label: buildAccountLabel(row, entidadGroup.companyName),
      estimado: row.estimado,
      real: row.real,
      pendiente: row.pendiente,
    });

    marcaGroup.estimado += row.estimado;
    marcaGroup.real += row.real;
    entidadGroup.estimado += row.estimado;
    entidadGroup.real += row.real;
    l1Group.estimado += row.estimado;
    l1Group.real += row.real;
  }

  const orderedL1Keys = [
    ...L1_GROUP_ORDER.filter((k) => l1Map.has(k)),
    ...[...l1Map.keys()].filter((k) => !L1_GROUP_ORDER.includes(k)),
  ];

  return orderedL1Keys.map((l1Key) => {
    const l1Group = l1Map.get(l1Key)!;

    const entidades: EntidadGroup[] = [...l1Group.entidades.values()]
      .sort((a, b) => {
        if (a.companyName === SIN_ENTIDAD_LABEL) return 1;
        if (b.companyName === SIN_ENTIDAD_LABEL) return -1;
        return a.companyName.localeCompare(b.companyName);
      })
      .map((entidadGroup) => {
        const marcas: MarcaGroup[] = [...entidadGroup.marcas.values()]
          .sort((a, b) => marcaSortIndex(a.marca) - marcaSortIndex(b.marca) || a.marca.localeCompare(b.marca))
          .map((marcaGroup) => ({
            key: marcaGroup.key,
            marca: marcaGroup.marca,
            estimado: marcaGroup.estimado,
            real: marcaGroup.real,
            pendiente: marcaGroup.estimado - marcaGroup.real,
            cuentas: [...marcaGroup.cuentas].sort((a, b) => a.label.localeCompare(b.label)),
          }));

        return {
          key: entidadGroup.key,
          companyId: entidadGroup.companyId,
          companyName: entidadGroup.companyName,
          estimado: entidadGroup.estimado,
          real: entidadGroup.real,
          pendiente: entidadGroup.estimado - entidadGroup.real,
          marcas,
        };
      });

    return {
      key: l1Group.key,
      l1: l1Group.l1,
      label: L1_LABELS[l1Group.l1] ?? l1Group.l1,
      estimado: l1Group.estimado,
      real: l1Group.real,
      pendiente: l1Group.estimado - l1Group.real,
      entidades,
    };
  });
}
