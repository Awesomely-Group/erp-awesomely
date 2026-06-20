import { prisma } from "./prisma";

// ─── Public params ────────────────────────────────────────────────────────────

export interface PlParams {
  year?: string;
}

// ─── P&L line structure (PGC) ─────────────────────────────────────────────────

export type PlDataKey =
  | "ventas"
  | "aprovisionamientos"
  | "variacion_existencias"
  | "trabajos_activo"
  | "otros_ingresos_explotacion"
  | "gastos_personal"
  | "otros_gastos_explotacion"
  | "amortizacion"
  | "otros_resultados"
  | "ingresos_financieros"
  | "gastos_financieros"
  | "otros_resultados_financieros"
  | "impuesto_beneficios";

export type PlSubtotalKey =
  | "margen_bruto"
  | "ebitda"
  | "ebit"
  | "resultado_financiero"
  | "resultado_antes_impuestos"
  | "resultado_ejercicio"
  | "cash_flow";

export type PlLineKey = PlDataKey | PlSubtotalKey;

export interface PlLineDef {
  key: PlLineKey;
  label: string;
  type: "data" | "subtotal";
}

export const PL_LINE_DEFS: PlLineDef[] = [
  { key: "ventas",                        label: "Ventas",                                    type: "data" },
  { key: "aprovisionamientos",            label: "Aprovisionamientos",                        type: "data" },
  { key: "margen_bruto",                  label: "Margen Bruto",                              type: "subtotal" },
  { key: "variacion_existencias",         label: "Variación de existencias",                  type: "data" },
  { key: "trabajos_activo",               label: "Trabajos realizados para su activo",         type: "data" },
  { key: "otros_ingresos_explotacion",    label: "Otros ingresos de explotación",             type: "data" },
  { key: "gastos_personal",               label: "Gastos de personal",                        type: "data" },
  { key: "otros_gastos_explotacion",      label: "Otros gastos de explotación",               type: "data" },
  { key: "amortizacion",                  label: "Amortización del inmovilizado",             type: "data" },
  { key: "otros_resultados",              label: "Otros resultados",                          type: "data" },
  { key: "ebitda",                        label: "EBITDA",                                    type: "subtotal" },
  { key: "ebit",                          label: "Resultado de Explotación (EBIT)",           type: "subtotal" },
  { key: "ingresos_financieros",          label: "Ingresos financieros",                      type: "data" },
  { key: "gastos_financieros",            label: "Gastos financieros",                        type: "data" },
  { key: "otros_resultados_financieros",  label: "Otros resultados financieros",              type: "data" },
  { key: "resultado_financiero",          label: "Resultado Financiero",                      type: "subtotal" },
  { key: "resultado_antes_impuestos",     label: "Resultado antes de impuestos",              type: "subtotal" },
  { key: "impuesto_beneficios",           label: "Impuesto sobre beneficios",                 type: "data" },
  { key: "resultado_ejercicio",           label: "Resultado del ejercicio",                   type: "subtotal" },
  { key: "cash_flow",                     label: "Cash Flow",                                 type: "subtotal" },
];

// ─── Account prefix → P&L line (PGC ranges) ──────────────────────────────────

/** Holded ObjectId: exactly 24 hex chars — must NOT be parsed as a PGC code. */
const HOLDED_OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

/**
 * Returns the 3-digit PGC prefix for a numeric account code.
 * Returns 0 for Holded internal ObjectIds (24-char hex) so they are not
 * misclassified (e.g. "6846bc77…" would otherwise yield prefix 684 → Amortización).
 */
function accountPrefix(account: string): number {
  if (HOLDED_OBJECT_ID_RE.test(account.trim())) return 0;
  return parseInt(account.replace(/\D/g, "").substring(0, 3), 10) || 0;
}

// Mapea el prefijo de cuenta PGC (3 dígitos) a la línea del P&L.
// Usado para líneas de facturas de compra (PURCHASE invoices).
// Devuelve null cuando el prefijo no corresponde a ninguna cuenta de P&L conocida.
function prefixToDataKey(prefix: number): PlDataKey | null {
  // ── Costes (6xx) ──────────────────────────────────────────────────────────
  if (prefix >= 600 && prefix <= 609) return "aprovisionamientos";
  if (prefix >= 610 && prefix <= 619) return "variacion_existencias";
  if (prefix >= 620 && prefix <= 629) return "otros_gastos_explotacion";
  if (prefix >= 630 && prefix <= 639) return "impuesto_beneficios";
  if (prefix >= 640 && prefix <= 649) return "gastos_personal";
  if (prefix >= 650 && prefix <= 659) return "otros_resultados";
  if (prefix >= 660 && prefix <= 669) return "gastos_financieros";
  if (prefix >= 670 && prefix <= 679) return "otros_resultados";
  if (prefix >= 680 && prefix <= 699) return "amortizacion";
  // ── Ingresos (7xx) — aparecen en facturas de compra como abonos/rectificativas ──
  if (prefix >= 700 && prefix <= 709) return "ventas";
  if (prefix === 731)                  return "trabajos_activo";
  if (prefix >= 740 && prefix <= 759) return "otros_ingresos_explotacion";
  if (prefix >= 760 && prefix <= 769) return "ingresos_financieros";
  if (prefix >= 770 && prefix <= 779) return "otros_resultados_financieros";
  // Prefijo desconocido — no se puede clasificar
  return null;
}

/**
 * Fallback classifier when accountingAccount is a Holded ObjectId and
 * we can only rely on the human-readable accountingAccountName.
 */
function nameToDataKey(name: string | null): PlDataKey {
  if (!name) return "otros_gastos_explotacion";
  const n = name.toLowerCase();
  if (/compra|aprovision|mercader[ií]a|suministro/.test(n)) return "aprovisionamientos";
  if (/personal|sueldo|n[oó]mina|salario|seguridad social/.test(n)) return "gastos_personal";
  if (/alquiler|arrendamiento/.test(n)) return "otros_gastos_explotacion";
  if (/amortizaci[oó]n|depreciaci[oó]n/.test(n)) return "amortizacion";
  if (/servicios profesionales|asesor[ií]a|consultor[ií]a/.test(n)) return "otros_gastos_explotacion";
  if (/intereses|comisi[oó]n bancaria/.test(n)) return "gastos_financieros";
  if (/variaci[oó]n de existencias/.test(n)) return "variacion_existencias";
  if (/trabajo.*activo/.test(n)) return "trabajos_activo";
  if (/ingresos financieros/.test(n)) return "ingresos_financieros";
  if (/otros resultados financieros/.test(n)) return "otros_resultados_financieros";
  if (/impuesto/.test(n)) return "impuesto_beneficios";
  return "otros_gastos_explotacion";
}

/**
 * Resolves the P&L data key for a PURCHASE invoice line:
 * 1. Uses PGC prefix from accountingAccount when it is a numeric code.
 * 2. Falls back to name-based heuristic when account is a Holded ObjectId
 *    or the prefix is not in any known PGC range.
 */
function resolveExpenseKey(account: string | null, accountName: string | null): PlDataKey {
  if (account) {
    const prefix = accountPrefix(account);
    if (prefix !== 0) {
      const key = prefixToDataKey(prefix);
      if (key !== null) return key;
    }
  }
  return nameToDataKey(accountName);
}

// Mapea el prefijo de cuenta PGC a la línea del P&L para asientos contables.
// A diferencia de prefixToDataKey, cubre también cuentas de ingreso (7xx)
// en su rango completo y devuelve null para cuentas de balance (no P&L).
// Los importes de asientos ya vienen con signo (crédito − débito): no hay que negarlos.
function journalAccountToPlKey(account: string): PlDataKey | null {
  const digits = account.replace(/\D/g, "");
  if (!digits) return null;
  const prefix = parseInt(digits.substring(0, 3), 10) || 0;

  // ── Ingresos (7xx) ────────────────────────────────────────────────────────
  if (prefix >= 700 && prefix <= 709) return "ventas";
  if (prefix >= 710 && prefix <= 719) return "variacion_existencias";
  if (prefix >= 720 && prefix <= 729) return "trabajos_activo";
  if (prefix === 731)                  return "trabajos_activo";
  if (prefix >= 740 && prefix <= 759) return "otros_ingresos_explotacion";
  if (prefix >= 760 && prefix <= 769) return "ingresos_financieros";
  if (prefix >= 770 && prefix <= 779) return "otros_resultados_financieros";

  // ── Costes (6xx) ──────────────────────────────────────────────────────────
  if (prefix >= 600 && prefix <= 609) return "aprovisionamientos";
  if (prefix >= 610 && prefix <= 619) return "variacion_existencias";
  if (prefix >= 620 && prefix <= 629) return "otros_gastos_explotacion";
  if (prefix >= 630 && prefix <= 639) return "impuesto_beneficios";
  if (prefix >= 640 && prefix <= 649) return "gastos_personal";
  if (prefix >= 650 && prefix <= 659) return "otros_resultados";
  if (prefix >= 660 && prefix <= 669) return "gastos_financieros";
  if (prefix >= 670 && prefix <= 679) return "otros_resultados";
  if (prefix >= 680 && prefix <= 699) return "amortizacion";

  // Cuenta de balance (1xx-5xx, 8xx-9xx) → no pertenece al P&L
  return null;
}

// ─── Subtotal computation ─────────────────────────────────────────────────────

type DataRecord = Record<PlDataKey, number>;
type FullRecord = Record<PlLineKey, number>;

function emptyData(): DataRecord {
  return {
    ventas: 0, aprovisionamientos: 0, variacion_existencias: 0,
    trabajos_activo: 0, otros_ingresos_explotacion: 0, gastos_personal: 0,
    otros_gastos_explotacion: 0, amortizacion: 0, otros_resultados: 0,
    ingresos_financieros: 0, gastos_financieros: 0, otros_resultados_financieros: 0,
    impuesto_beneficios: 0,
  };
}

function computeSubtotals(d: DataRecord): FullRecord {
  const margen_bruto              = d.ventas + d.aprovisionamientos;
  const ebitda                    = margen_bruto + d.variacion_existencias + d.trabajos_activo
                                    + d.otros_ingresos_explotacion + d.gastos_personal
                                    + d.otros_gastos_explotacion + d.otros_resultados;
  const ebit                      = ebitda + d.amortizacion;
  const resultado_financiero      = d.ingresos_financieros + d.gastos_financieros + d.otros_resultados_financieros;
  const resultado_antes_impuestos = ebit + resultado_financiero;
  const resultado_ejercicio       = resultado_antes_impuestos + d.impuesto_beneficios;
  const cash_flow                 = resultado_ejercicio - d.amortizacion; // add back non-cash depreciation

  return {
    ...d,
    margen_bruto, ebitda, ebit, resultado_financiero,
    resultado_antes_impuestos, resultado_ejercicio, cash_flow,
  };
}

// ─── Month helpers ────────────────────────────────────────────────────────────

function buildMonthDataMap(year: number): Map<string, { label: string; data: DataRecord }> {
  const map = new Map<string, { label: string; data: DataRecord }>();
  for (let m = 0; m < 12; m++) {
    const d = new Date(year, m, 1);
    const monthKey = `${year}-${String(m + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("es-ES", { month: "short" }).replace(".", "").toUpperCase();
    map.set(monthKey, { label, data: emptyData() });
  }
  return map;
}

function toMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// ─── Public types ─────────────────────────────────────────────────────────────

export interface PlMonthPoint {
  monthKey: string;
  monthLabel: string;
  lines: FullRecord;
}

export interface PlEntityData {
  companyId: string;
  companyName: string;
  months: PlMonthPoint[];
  yearly: FullRecord;
}

export interface PlData {
  year: number;
  entities: PlEntityData[];
  consolidated: PlEntityData;
}

// ─── Raw query types ──────────────────────────────────────────────────────────

interface RevenueRow {
  company_id: string;
  company_name: string;
  month: Date;
  amount: unknown;
}

interface ExpenseLineRow {
  company_id: string;
  company_name: string;
  month: Date;
  account: string | null;
  account_name: string | null;
  amount: unknown;
}

interface JournalRow {
  company_id: string;
  company_name: string;
  month: Date;
  account: string;
  amount: unknown; // ya con signo: crédito − débito
}

// ─── Main data function ───────────────────────────────────────────────────────

export async function getPlData(params: PlParams): Promise<PlData> {
  const year       = params.year ? parseInt(params.year, 10) : new Date().getFullYear();
  const startDate  = new Date(year, 0, 1);
  const endDate    = new Date(year + 1, 0, 1);

  const [revenueRows, expenseRows, journalRows] = await Promise.all([
    // ── Facturas de venta ────────────────────────────────────────────────────
    prisma.$queryRaw<RevenueRow[]>`
      SELECT
        c.id   AS company_id,
        c.name AS company_name,
        DATE_TRUNC('month', COALESCE(i."accountingMonth", i.date)) AS month,
        SUM(i.subtotal * i."fxRateToEur") AS amount
      FROM invoices i
      JOIN companies c ON c.id = i."companyId"
      WHERE i.type::text = 'SALE'
        AND (i."holdedStatus" IS NULL OR i."holdedStatus" != -1)
        AND i."removedFromHoldedAt" IS NULL
        AND COALESCE(i."accountingMonth", i.date) >= ${startDate}
        AND COALESCE(i."accountingMonth", i.date) <  ${endDate}
      GROUP BY c.id, c.name, DATE_TRUNC('month', COALESCE(i."accountingMonth", i.date))
    `,
    // ── Líneas de facturas de compra ─────────────────────────────────────────
    prisma.$queryRaw<ExpenseLineRow[]>`
      SELECT
        c.id                       AS company_id,
        c.name                     AS company_name,
        DATE_TRUNC('month', COALESCE(i."accountingMonth", i.date)) AS month,
        il."accountingAccount"     AS account,
        il."accountingAccountName" AS account_name,
        SUM(il.subtotal * i."fxRateToEur") AS amount
      FROM invoices i
      JOIN companies c ON c.id = i."companyId"
      JOIN invoice_lines il ON il."invoiceId" = i.id
      WHERE i.type::text = 'PURCHASE'
        AND (i."holdedStatus" IS NULL OR i."holdedStatus" != -1)
        AND i."removedFromHoldedAt" IS NULL
        AND COALESCE(i."accountingMonth", i.date) >= ${startDate}
        AND COALESCE(i."accountingMonth", i.date) <  ${endDate}
      GROUP BY c.id, c.name, DATE_TRUNC('month', COALESCE(i."accountingMonth", i.date)),
               il."accountingAccount", il."accountingAccountName"
    `,
    // ── Asientos contables (nóminas, amortizaciones, asientos manuales…) ────
    // amountEur ya viene con signo correcto (crédito − débito).
    prisma.$queryRaw<JournalRow[]>`
      SELECT
        c.id   AS company_id,
        c.name AS company_name,
        DATE_TRUNC('month', COALESCE(jel."accountingMonth", jel.date)) AS month,
        jel.account,
        SUM(jel."amountEur") AS amount
      FROM journal_entry_lines jel
      JOIN companies c ON c.id = jel."companyId"
      WHERE COALESCE(jel."accountingMonth", jel.date) >= ${startDate}
        AND COALESCE(jel."accountingMonth", jel.date) <  ${endDate}
      GROUP BY c.id, c.name,
               DATE_TRUNC('month', COALESCE(jel."accountingMonth", jel.date)),
               jel.account
    `,
  ]);

  // ── Populate entity maps ───────────────────────────────────────────────────

  const entityMap = new Map<string, { name: string; months: Map<string, { label: string; data: DataRecord }> }>();

  const ensureEntity = (id: string, name: string) => {
    if (!entityMap.has(id)) entityMap.set(id, { name, months: buildMonthDataMap(year) });
    return entityMap.get(id)!;
  };

  for (const row of revenueRows) {
    const entity = ensureEntity(row.company_id, row.company_name);
    const monthKey = toMonthKey(new Date(row.month));
    const point = entity.months.get(monthKey);
    if (point) point.data.ventas += Number(row.amount);
  }

  for (const row of expenseRows) {
    const entity = ensureEntity(row.company_id, row.company_name);
    const monthKey = toMonthKey(new Date(row.month));
    const point = entity.months.get(monthKey);
    if (!point) continue;

    const rawAmount = Number(row.amount);
    const lineKey   = resolveExpenseKey(row.account, row.account_name);

    // Los importes de facturas de compra son positivos en la query;
    // los negamos para el P&L salvo cuentas de ingreso (abonos, etc.)
    const incomeAccounts: PlDataKey[] = ["ingresos_financieros", "otros_ingresos_explotacion", "otros_resultados_financieros", "trabajos_activo", "ventas"];
    const signed = incomeAccounts.includes(lineKey) ? rawAmount : -rawAmount;
    point.data[lineKey] += signed;
  }

  // ── Asientos contables (nóminas, amortizaciones, asientos manuales…) ────────
  // amountEur ya viene con signo convencional del P&L (crédito − débito):
  //   negativo → gasto, positivo → ingreso. No hay que negar.
  for (const row of journalRows) {
    const entity   = ensureEntity(row.company_id, row.company_name);
    const monthKey = toMonthKey(new Date(row.month));
    const point    = entity.months.get(monthKey);
    if (!point) continue;

    const lineKey = journalAccountToPlKey(row.account);
    if (!lineKey) continue; // cuenta de balance → ignorar

    point.data[lineKey] += Number(row.amount);
  }

  // ── Build consolidated accumulator ─────────────────────────────────────────

  const consolidatedMonths = buildMonthDataMap(year);
  const entities: PlEntityData[] = [];

  for (const [companyId, { name, months }] of entityMap) {
    const monthPoints: PlMonthPoint[] = [];

    for (const [monthKey, { label, data }] of months) {
      monthPoints.push({ monthKey, monthLabel: label, lines: computeSubtotals(data) });

      const cp = consolidatedMonths.get(monthKey)!;
      for (const k of Object.keys(data) as PlDataKey[]) cp.data[k] += data[k];
    }

    monthPoints.sort((a, b) => a.monthKey.localeCompare(b.monthKey));

    const yearlyData = emptyData();
    for (const k of Object.keys(yearlyData) as PlDataKey[]) {
      yearlyData[k] = monthPoints.reduce((s, m) => s + m.lines[k], 0);
    }

    entities.push({ companyId, companyName: name, months: monthPoints, yearly: computeSubtotals(yearlyData) });
  }

  entities.sort((a, b) => a.companyName.localeCompare(b.companyName));

  // ── Consolidated entity ────────────────────────────────────────────────────

  const consolidatedPoints: PlMonthPoint[] = [];
  for (const [monthKey, { label, data }] of consolidatedMonths) {
    consolidatedPoints.push({ monthKey, monthLabel: label, lines: computeSubtotals(data) });
  }
  consolidatedPoints.sort((a, b) => a.monthKey.localeCompare(b.monthKey));

  const consolidatedYearlyData = emptyData();
  for (const k of Object.keys(consolidatedYearlyData) as PlDataKey[]) {
    consolidatedYearlyData[k] = consolidatedPoints.reduce((s, m) => s + m.lines[k], 0);
  }

  return {
    year,
    entities,
    consolidated: {
      companyId:   "consolidated",
      companyName: "Consolidado",
      months:      consolidatedPoints,
      yearly:      computeSubtotals(consolidatedYearlyData),
    },
  };
}

// ─── Years available ──────────────────────────────────────────────────────────

export async function getPlYears(): Promise<number[]> {
  const rows = await prisma.$queryRaw<{ year: number }[]>`
    SELECT DISTINCT DATE_PART('year', COALESCE("accountingMonth", date))::int AS year
    FROM invoices
    WHERE "holdedStatus" IS NULL OR "holdedStatus" != -1
    ORDER BY year DESC
  `;
  return rows.map((r) => Number(r.year));
}
