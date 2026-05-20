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

function accountPrefix(account: string): number {
  return parseInt(account.replace(/\D/g, "").substring(0, 3), 10) || 0;
}

function prefixToDataKey(prefix: number): PlDataKey {
  if (prefix >= 600 && prefix <= 609) return "aprovisionamientos";
  if (prefix >= 610 && prefix <= 619) return "variacion_existencias";
  if (prefix >= 630 && prefix <= 639) return "impuesto_beneficios";
  if (prefix >= 620 && prefix <= 629) return "otros_gastos_explotacion";
  if (prefix >= 640 && prefix <= 649) return "gastos_personal";
  if (prefix >= 660 && prefix <= 669) return "gastos_financieros";
  if (prefix >= 670 && prefix <= 679) return "otros_resultados";
  if (prefix >= 680 && prefix <= 699) return "amortizacion";
  if (prefix === 731)                  return "trabajos_activo";
  if (prefix >= 740 && prefix <= 759) return "otros_ingresos_explotacion";
  if (prefix >= 760 && prefix <= 769) return "ingresos_financieros";
  if (prefix >= 770 && prefix <= 779) return "otros_resultados_financieros";
  // Default: unclassified PURCHASE lines → aprovisionamientos
  return "aprovisionamientos";
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
  amount: unknown;
}

// ─── Main data function ───────────────────────────────────────────────────────

export async function getPlData(params: PlParams): Promise<PlData> {
  const year       = params.year ? parseInt(params.year, 10) : new Date().getFullYear();
  const startDate  = new Date(year, 0, 1);
  const endDate    = new Date(year + 1, 0, 1);

  const [revenueRows, expenseRows] = await Promise.all([
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
        AND COALESCE(i."accountingMonth", i.date) >= ${startDate}
        AND COALESCE(i."accountingMonth", i.date) <  ${endDate}
      GROUP BY c.id, c.name, DATE_TRUNC('month', COALESCE(i."accountingMonth", i.date))
    `,
    prisma.$queryRaw<ExpenseLineRow[]>`
      SELECT
        c.id                   AS company_id,
        c.name                 AS company_name,
        DATE_TRUNC('month', COALESCE(i."accountingMonth", i.date)) AS month,
        il."accountingAccount" AS account,
        SUM(il.subtotal * i."fxRateToEur") AS amount
      FROM invoices i
      JOIN companies c ON c.id = i."companyId"
      JOIN invoice_lines il ON il."invoiceId" = i.id
      WHERE i.type::text = 'PURCHASE'
        AND (i."holdedStatus" IS NULL OR i."holdedStatus" != -1)
        AND COALESCE(i."accountingMonth", i.date) >= ${startDate}
        AND COALESCE(i."accountingMonth", i.date) <  ${endDate}
      GROUP BY c.id, c.name, DATE_TRUNC('month', COALESCE(i."accountingMonth", i.date)), il."accountingAccount"
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
    const lineKey   = row.account ? prefixToDataKey(accountPrefix(row.account)) : "aprovisionamientos";

    // PURCHASE amounts are costs → store as negative in P&L
    // Exception: income-type accounts on PURCHASE side stay positive
    const incomeAccounts: PlDataKey[] = ["ingresos_financieros", "otros_ingresos_explotacion", "otros_resultados_financieros", "trabajos_activo"];
    const signed = incomeAccounts.includes(lineKey) ? rawAmount : -rawAmount;
    point.data[lineKey] += signed;
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
