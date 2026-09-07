import { Prisma, ForecastType, PaymentDirection } from "@prisma/client";
import { prisma } from "./prisma";
import { getDateRange } from "./date-range";
import {
  MARCA_FILTER_UNASSIGNED,
  ACCOUNT_L1_GROUP_ORDER,
  cashflowScopeConditions,
  invoiceWhereMarca,
  proformaWhereMarca,
} from "./org";
import { HoldedClient } from "./holded";

export type CashflowParams = {
  period?: string;
  dateFrom?: string;
  dateTo?: string;
  marca?: string;
  company?: string;
  account?: string;
  l1?: string;
  selectedMonth?: string;
  scenario?: string;
};

export type CashflowMonthlyPoint = {
  monthKey: string;
  monthLabel: string;
  inflowsBase: number;
  inflowsTax: number;
  inflows: number;
  outflowsBase: number;
  outflowsTax: number;
  outflows: number;
  net: number;
  /** Comprometido (E10, revisión 2026-09-03): suma de proformas activas (no facturadas ni
   * canceladas). Solo aplica a ingresos — no hay equivalente de "comprometido" en gastos. */
  committedInflows: number;
  /** Estimado: solo previsiones manuales (`Forecast`), sin mezclar con proformas. */
  estimatedInflows: number;
  estimatedOutflows: number;
  trendInflows: number;
  trendOutflows: number;
};

export type CashflowKpis = {
  totalInflows: number;
  totalOutflows: number;
  netCashflow: number;
  monthCount: number;
  totalCommittedInflows: number;
  totalEstimatedInflows: number;
  totalEstimatedOutflows: number;
};

type RawMonthlyRow = {
  month: Date;
  invoice_type: string;
  subtotal_eur: unknown;
  total_eur: unknown;
};

type ProformaMonthRow = { month: Date; total_eur: unknown };
type ForecastMonthRow = { month: Date; type: string; pessimistic: unknown; optimistic: unknown };
type ManualPaymentMonthRow = { month: Date; direction: string; total_eur: unknown };

/**
 * Resuelve el rango de fechas de un filtro de periodo.
 *
 * OJO (E8, revisión 2026-09-03): los casos "last_X_months" solo ponían `gte`, sin
 * `lte` — así que aunque el selector diga "últimos X meses", los KPIs de previsión
 * (proformas + previsiones manuales, que sí pueden tener fecha futura) incluían
 * también meses futuros sin límite. Esto fue el origen real de una confusión de
 * cifras en la reunión ("¿por qué la previsión de últimos 12 meses incluye 2027?").
 * Ahora "últimos X meses" es explícitamente [hoy - X meses, fin del mes en curso] —
 * para ver previsión de meses futuros hay que usar "Personalizado" con una fecha
 * "Hasta" más adelante.
 */
export function resolveDateRange(params: CashflowParams): { gte?: Date; lte?: Date } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const endOfCurrentMonth = new Date(y, m + 1, 0, 23, 59, 59, 999);

  switch (params.period) {
    case "last_3_months":
      return { gte: new Date(y, m - 3, 1), lte: endOfCurrentMonth };
    case "last_6_months":
      return { gte: new Date(y, m - 6, 1), lte: endOfCurrentMonth };
    case "last_12_months":
      return { gte: new Date(y, m - 12, 1), lte: endOfCurrentMonth };
    case "this_year":
    case "custom":
      return getDateRange(params.period, params.dateFrom, params.dateTo);
    default:
      return { gte: new Date(y, m - 12, 1), lte: endOfCurrentMonth };
  }
}

export async function getCashflowData(
  rawParams: CashflowParams,
  withForecast = true
): Promise<{ monthly: CashflowMonthlyPoint[]; kpis: CashflowKpis }> {
  // Resolve l1 → account numbers
  const l1List = rawParams.l1?.split(",").filter(Boolean) ?? [];
  let params = rawParams;
  if (l1List.length > 0) {
    const mappings = await prisma.accountMapping.findMany({ where: { l1: { in: l1List } } });
    const l1Accounts = [
      ...new Set(
        mappings.flatMap((m) => [m.accountNumSL, m.accountNumOU].filter(Boolean) as string[])
      ),
    ];
    const explicitAccounts = rawParams.account?.split(",").filter(Boolean) ?? [];
    const resolvedAccounts =
      explicitAccounts.length > 0
        ? l1Accounts.filter((a) => explicitAccounts.includes(a))
        : l1Accounts;
    params = { ...rawParams, account: resolvedAccounts.join(",") || undefined };
  }

  const dateRange = resolveDateRange(params);
  const accounts = params.account?.split(",").filter(Boolean) ?? [];
  let rows: RawMonthlyRow[];

  if (accounts.length > 0) {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`il."accountingAccount" IN (${Prisma.join(accounts.map((a) => Prisma.sql`${a}`))})`,
    ];
    if (dateRange.gte) conditions.push(Prisma.sql`i.date >= ${dateRange.gte}`);
    if (dateRange.lte) conditions.push(Prisma.sql`i.date <= ${dateRange.lte}`);
    {
      const marcaList = params.marca?.split(",").filter(Boolean) ?? [];
      const hasUnassigned = marcaList.includes(MARCA_FILTER_UNASSIGNED);
      const namedMarcas = marcaList.filter((m) => m !== MARCA_FILTER_UNASSIGNED);
      if (marcaList.length > 0) {
        const mc: Prisma.Sql[] = [];
        if (hasUnassigned) mc.push(Prisma.sql`i.marca IS NULL`);
        if (namedMarcas.length > 0)
          mc.push(Prisma.sql`i.marca IN (${Prisma.join(namedMarcas.map((m) => Prisma.sql`${m}`))})`);
        if (mc.length === 1) conditions.push(mc[0]);
        else conditions.push(Prisma.sql`(${Prisma.join(mc, " OR ")})`);
      }
    }
    if (params.company) conditions.push(Prisma.sql`i."companyId" = ${params.company}`);

    const where = Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
    rows = await prisma.$queryRaw<RawMonthlyRow[]>`
      SELECT
        DATE_TRUNC('month', i.date)         AS month,
        i.type                              AS invoice_type,
        SUM(il.subtotal * i."fxRateToEur")  AS subtotal_eur,
        SUM(il."totalEur")                  AS total_eur
      FROM invoices i
      JOIN invoice_lines il ON il."invoiceId" = i.id
      ${where}
      GROUP BY DATE_TRUNC('month', i.date), i.type
      ORDER BY month ASC
    `;
  } else {
    const conditions: Prisma.Sql[] = [];
    if (dateRange.gte) conditions.push(Prisma.sql`date >= ${dateRange.gte}`);
    if (dateRange.lte) conditions.push(Prisma.sql`date <= ${dateRange.lte}`);
    {
      const marcaList = params.marca?.split(",").filter(Boolean) ?? [];
      const hasUnassigned = marcaList.includes(MARCA_FILTER_UNASSIGNED);
      const namedMarcas = marcaList.filter((m) => m !== MARCA_FILTER_UNASSIGNED);
      if (marcaList.length > 0) {
        const mc: Prisma.Sql[] = [];
        if (hasUnassigned) mc.push(Prisma.sql`marca IS NULL`);
        if (namedMarcas.length > 0)
          mc.push(Prisma.sql`marca IN (${Prisma.join(namedMarcas.map((m) => Prisma.sql`${m}`))})`);
        if (mc.length === 1) conditions.push(mc[0]);
        else conditions.push(Prisma.sql`(${Prisma.join(mc, " OR ")})`);
      }
    }
    if (params.company) conditions.push(Prisma.sql`"companyId" = ${params.company}`);

    const where =
      conditions.length > 0
        ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`
        : Prisma.empty;

    rows = await prisma.$queryRaw<RawMonthlyRow[]>`
      SELECT
        DATE_TRUNC('month', date)         AS month,
        type                              AS invoice_type,
        SUM(subtotal * "fxRateToEur")     AS subtotal_eur,
        SUM("totalEur")                   AS total_eur
      FROM invoices
      ${where}
      GROUP BY DATE_TRUNC('month', date), type
      ORDER BY month ASC
    `;
  }

  const scenario = params.scenario === "optimistic" ? "optimistic" : "pessimistic";

  // Resuelve accountMappingId(s) que coinciden con los filtros l1/account, para aplicar
  // el mismo filtro de categoría/cuenta a las previsiones manuales (`Forecast`).
  let forecastAccountMappingIds: string[] | undefined;
  if (l1List.length > 0 || accounts.length > 0) {
    const mappings = await prisma.accountMapping.findMany({
      where: {
        ...(l1List.length > 0 ? { l1: { in: l1List } } : {}),
        ...(accounts.length > 0
          ? { OR: [{ accountNumSL: { in: accounts } }, { accountNumOU: { in: accounts } }] }
          : {}),
      },
      select: { id: true },
    });
    forecastAccountMappingIds = mappings.map((m) => m.id);
  }

  // Pagos manuales sueltos (sin factura asociada) YA MARCADOS COMO PAGADOS
  // (`paidAt` no nulo — los pendientes, con `paidAt` null, todavía no son un movimiento
  // de caja real y no deben contar aquí, solo aparecen en la lista de pendientes de
  // /payments). A diferencia de proformas/forecasts son movimientos de caja reales
  // (ya ocurrieron, no una proyección), así que se calculan siempre, independientemente
  // de `withForecast`, y se suman más abajo a los actuals (inflowsBase/outflowsBase), no
  // a committedInflows/estimatedInflows/estimatedOutflows. Los pagos ligados a una factura (invoiceId no
  // nulo) no se incluyen aquí: su importe ya se cuenta a través de la propia factura en
  // la consulta `rows` de más arriba — sumarlos también aquí duplicaría el importe.
  const manualPaymentConditions: Prisma.Sql[] = [
    Prisma.sql`"invoiceId" IS NULL`,
    Prisma.sql`"paidAt" IS NOT NULL`,
    ...cashflowScopeConditions({ marca: params.marca, company: params.company }),
  ];
  if (dateRange.gte) manualPaymentConditions.push(Prisma.sql`"paidAt" >= ${dateRange.gte}`);
  if (dateRange.lte) manualPaymentConditions.push(Prisma.sql`"paidAt" <= ${dateRange.lte}`);
  if (forecastAccountMappingIds) {
    manualPaymentConditions.push(
      forecastAccountMappingIds.length > 0
        ? Prisma.sql`"accountMappingId" IN (${Prisma.join(forecastAccountMappingIds.map((id) => Prisma.sql`${id}`))})`
        : Prisma.sql`FALSE`
    );
  }
  const manualPaymentsPromise = prisma.$queryRaw<ManualPaymentMonthRow[]>`
    SELECT DATE_TRUNC('month', "paidAt") AS month, direction, SUM(amount) AS total_eur
    FROM invoice_payments
    WHERE ${Prisma.join(manualPaymentConditions, " AND ")}
    GROUP BY DATE_TRUNC('month', "paidAt"), direction
    ORDER BY month ASC
  `;

  const [proformaRows, forecastRows, manualPaymentRows] = await Promise.all([
    withForecast
      ? (() => {
          // Mismos filtros que la consulta de facturas de más arriba (cuenta
          // contable no aplica: una proforma no tiene líneas contables todavía). Antes
          // esta consulta solo filtraba por fecha y `holdedStatus`, así que una
          // proforma de otra entidad legal o marca se colaba en el gráfico de
          // cualquier filtro — el bug que vio Irene con una proforma de Modus
          // Operandi apareciendo en la cuenta de la SL. `cashflowScopeConditions` es
          // la misma lógica de marca/entidad que usa el forecast de abajo: compartida
          // a propósito para que no se pueda volver a desincronizar así.
          //
          // E10 (revisión 2026-09-03): esta suma es ahora "Comprometido", no una mezcla
          // de proformas + previsión manual. El filtro de estados incluye 0/1 (Borrador),
          // 2 (Aprobado) y 4 (Vencida) — antes excluía el 2 "Aprobado" por error, así que
          // una proforma aprobada no contaba ni como previsión ni como real hasta que se
          // facturaba. Sigue excluyendo -1 (Cancelada, no cuenta) y 3 (Facturado, ya es
          // una factura real y se contaría dos veces).
          const conditions: Prisma.Sql[] = [
            Prisma.sql`"holdedStatus" IN (0, 1, 2, 4)`,
            ...cashflowScopeConditions({ marca: params.marca, company: params.company }),
          ];
          if (dateRange.gte) conditions.push(Prisma.sql`date >= ${dateRange.gte}`);
          if (dateRange.lte) conditions.push(Prisma.sql`date <= ${dateRange.lte}`);

          const where = Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
          return prisma.$queryRaw<ProformaMonthRow[]>`
            SELECT DATE_TRUNC('month', date) AS month, SUM("totalEur") AS total_eur
            FROM proformas
            ${where}
            GROUP BY DATE_TRUNC('month', date)
            ORDER BY month ASC
          `;
        })()
      : Promise.resolve([] as ProformaMonthRow[]),
    withForecast
      ? (() => {
          // Desde E6 (revisión 2026-09-03) los forecasts sí tienen `companyId`
          // (entidad legal), además de `marca`: se filtran igual que facturas/proformas.
          // Las previsiones creadas antes de este cambio tienen companyId null y
          // seguirán apareciendo salvo que se filtre explícitamente por entidad.
          const conditions: Prisma.Sql[] = [
            Prisma.sql`"isPaused" = false`,
            ...cashflowScopeConditions({ marca: params.marca, company: params.company }),
          ];
          if (dateRange.gte) conditions.push(Prisma.sql`month >= ${dateRange.gte}`);
          if (dateRange.lte) conditions.push(Prisma.sql`month <= ${dateRange.lte}`);
          if (forecastAccountMappingIds) {
            conditions.push(
              forecastAccountMappingIds.length > 0
                ? Prisma.sql`"accountMappingId" IN (${Prisma.join(forecastAccountMappingIds.map((id) => Prisma.sql`${id}`))})`
                : Prisma.sql`FALSE`
            );
          }
          const where = Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
          return prisma.$queryRaw<ForecastMonthRow[]>`
            SELECT DATE_TRUNC('month', month) AS month, type,
              SUM("amountPessimistic") AS pessimistic,
              SUM("amountOptimistic") AS optimistic
            FROM forecasts
            ${where}
            GROUP BY DATE_TRUNC('month', month), type
            ORDER BY month ASC
          `;
        })()
      : Promise.resolve([] as ForecastMonthRow[]),
    manualPaymentsPromise,
  ]);

  const pointMap = new Map<string, CashflowMonthlyPoint>();

  const ensurePoint = (d: Date): CashflowMonthlyPoint => {
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const monthLabel = d.toLocaleDateString("es-ES", { month: "short", year: "numeric" });
    if (!pointMap.has(monthKey)) {
      pointMap.set(monthKey, {
        monthKey,
        monthLabel,
        inflowsBase: 0,
        inflowsTax: 0,
        inflows: 0,
        outflowsBase: 0,
        outflowsTax: 0,
        outflows: 0,
        net: 0,
        committedInflows: 0,
        estimatedInflows: 0,
        estimatedOutflows: 0,
        trendInflows: 0,
        trendOutflows: 0,
      });
    }
    return pointMap.get(monthKey)!;
  };

  for (const row of rows) {
    const d = new Date(row.month);
    const point = ensurePoint(d);
    const subtotalAmt = Number(row.subtotal_eur);
    const totalAmt = Number(row.total_eur);
    const taxAmt = totalAmt - subtotalAmt;
    if (row.invoice_type === "SALE") {
      point.inflowsBase += subtotalAmt;
      point.inflowsTax += taxAmt;
      point.inflows = point.inflowsBase + point.inflowsTax;
    } else {
      point.outflowsBase += subtotalAmt;
      point.outflowsTax += taxAmt;
      point.outflows = point.outflowsBase + point.outflowsTax;
    }
    point.net = point.inflows - point.outflows;
  }

  for (const row of proformaRows) {
    const d = new Date(row.month);
    const point = ensurePoint(d);
    point.committedInflows += Number(row.total_eur);
  }

  for (const row of forecastRows) {
    const d = new Date(row.month);
    const point = ensurePoint(d);
    const amount = Number(scenario === "optimistic" ? row.optimistic : row.pessimistic);
    if (row.type === ForecastType.INCOME) {
      point.estimatedInflows += amount;
    } else {
      point.estimatedOutflows += amount;
    }
  }

  // Pagos manuales sueltos: son actuals (ya han ocurrido), no proyección — se suman a
  // inflowsBase/outflowsBase igual que las facturas, sin componente de impuesto (un
  // movimiento de caja puro no tiene desglose de IVA).
  for (const row of manualPaymentRows) {
    const d = new Date(row.month);
    const point = ensurePoint(d);
    const amount = Number(row.total_eur);
    if (row.direction === PaymentDirection.INCOME) {
      point.inflowsBase += amount;
      point.inflows = point.inflowsBase + point.inflowsTax;
    } else {
      point.outflowsBase += amount;
      point.outflows = point.outflowsBase + point.outflowsTax;
    }
    point.net = point.inflows - point.outflows;
  }

  const monthly = Array.from(pointMap.values()).sort((a, b) =>
    a.monthKey.localeCompare(b.monthKey)
  );

  if (withForecast) {
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    for (let i = 0; i < monthly.length; i++) {
      const point = monthly[i];
      const isPast = point.monthKey < currentMonthKey;
      if (isPast) {
        point.trendInflows = point.inflows;
        point.trendOutflows = point.outflows;
      } else {
        const pastActuals = monthly
          .slice(0, i)
          .filter((p) => p.monthKey < currentMonthKey);
        const win = pastActuals.slice(-3);
        const avgInflows =
          win.length > 0 ? win.reduce((s, p) => s + p.inflows, 0) / win.length : 0;
        const avgOutflows =
          win.length > 0 ? win.reduce((s, p) => s + p.outflows, 0) / win.length : 0;
        point.trendInflows = avgInflows + point.committedInflows + point.estimatedInflows;
        point.trendOutflows = avgOutflows + point.estimatedOutflows;
      }
    }
  }

  const kpis: CashflowKpis = {
    totalInflows: monthly.reduce((s, p) => s + p.inflows, 0),
    totalOutflows: monthly.reduce((s, p) => s + p.outflows, 0),
    netCashflow: monthly.reduce((s, p) => s + p.net, 0),
    monthCount: monthly.length,
    totalCommittedInflows: monthly.reduce((s, p) => s + p.committedInflows, 0),
    totalEstimatedInflows: monthly.reduce((s, p) => s + p.estimatedInflows, 0),
    totalEstimatedOutflows: monthly.reduce((s, p) => s + p.estimatedOutflows, 0),
  };

  return { monthly, kpis };
}

export async function getMonthInvoices(
  params: CashflowParams,
  monthKey: string
): Promise<{
  id: string;
  holdedId: string;
  number: string | null;
  type: string;
  counterparty: string | null;
  date: Date;
  totalEur: unknown;
  status: string;
  company: { name: string };
}[]> {
  const [yearStr, monthStr] = monthKey.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 0, 23, 59, 59, 999);

  const accounts = params.account?.split(",").filter(Boolean) ?? [];
  const marcaFilter = invoiceWhereMarca(params.marca);
  const where: Prisma.InvoiceWhereInput = {
    date: { gte: from, lte: to },
    ...(marcaFilter ?? {}),
    ...(params.company ? { companyId: params.company } : {}),
    ...(accounts.length > 0
      ? { lines: { some: { accountingAccount: { in: accounts } } } }
      : {}),
  };

  return prisma.invoice.findMany({
    where,
    select: {
      id: true,
      holdedId: true,
      number: true,
      type: true,
      counterparty: true,
      date: true,
      totalEur: true,
      status: true,
      company: { select: { name: true } },
    },
    orderBy: [{ type: "asc" }, { date: "asc" }],
  }) as Promise<{
    id: string;
    holdedId: string;
    number: string | null;
    type: string;
    counterparty: string | null;
    date: Date;
    totalEur: unknown;
    status: string;
    company: { name: string };
  }[]>;
}

export async function getMonthProformas(
  params: CashflowParams,
  monthKey: string
): Promise<{
  id: string;
  holdedId: string;
  number: string | null;
  counterparty: string | null;
  date: Date;
  totalEur: unknown;
  company: { name: string };
}[]> {
  const [yearStr, monthStr] = monthKey.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 0, 23, 59, 59, 999);

  const marcaFilter = proformaWhereMarca(params.marca);
  const where: Prisma.ProformaWhereInput = {
    date: { gte: from, lte: to },
    holdedStatus: { in: [0, 1, 4] },
    ...(marcaFilter ?? {}),
    ...(params.company ? { companyId: params.company } : {}),
  };

  return prisma.proforma.findMany({
    where,
    select: {
      id: true,
      holdedId: true,
      number: true,
      counterparty: true,
      date: true,
      totalEur: true,
      company: { select: { name: true } },
    },
    orderBy: { date: "asc" },
  });
}

export async function getCashflowCompanies(): Promise<{ id: string; name: string }[]> {
  return prisma.company.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export type AccountSystem = "SL" | "OU";

export type CashflowAccountOption = {
  num: string;
  name: string;
  l1: string | null;
  /**
   * Entidad legal a la que pertenece este número de cuenta (E7, revisión 2026-09-03):
   * SL = Gigson Solutions España, OU = entidad estonia. `null` cuando la cuenta no
   * está en `account_mappings` (p.ej. cuentas históricas sin mapear todavía) y no se
   * puede saber a qué sistema pertenece.
   */
  system: AccountSystem | null;
};

/**
 * Cuentas contables filtrables en cashflow/forecasts, con su categoría `l1`
 * (plan 28-ago, F2 redefinido: agrupar el selector en OPEX/CAPEX/COGS en vez del
 * módulo de justificantes sin factura que planteaba el plan original).
 */
export async function getCashflowAccounts(): Promise<CashflowAccountOption[]> {
  const [rows, companies, mappings] = await Promise.all([
    prisma.invoiceLine.findMany({
      where: { accountingAccount: { not: null } },
      select: { accountingAccount: true, accountingAccountName: true },
      distinct: ["accountingAccount"],
      orderBy: { accountingAccount: "asc" },
    }),
    prisma.company.findMany({ where: { active: true }, select: { holdedApiKey: true } }),
    // Todas las cuentas mapeadas, no solo COGS/OPEX/CAPEX: hace falta el mapeo
    // completo para poder etiquetar con su categoría también las que ya aparecían
    // por facturas reales (típicamente REVENUE), no solo las que se añaden más abajo
    // sin historial.
    prisma.accountMapping.findMany({
      select: {
        l1: true,
        description: true,
        accountNumSL: true,
        accountNameSL: true,
        accountNumOU: true,
        accountNameOU: true,
      },
    }),
  ]);

  const l1ByNum = new Map<string, string>();
  const systemByNum = new Map<string, AccountSystem>();
  for (const m of mappings) {
    if (m.accountNumSL) {
      l1ByNum.set(m.accountNumSL, m.l1);
      systemByNum.set(m.accountNumSL, "SL");
    }
    if (m.accountNumOU) {
      l1ByNum.set(m.accountNumOU, m.l1);
      systemByNum.set(m.accountNumOU, "OU");
    }
  }

  const holdedById = new Map<string, string>();
  const holdedByNum = new Map<string, string>();

  await Promise.all(
    companies.map(async (c) => {
      const maps = await new HoldedClient(c.holdedApiKey).getAccountMaps();
      for (const [k, v] of maps.byId) holdedById.set(k, v.name);
      for (const [k, v] of maps.byNum) holdedByNum.set(k, v);
    })
  );

  const seen = new Set<string>();
  const result: CashflowAccountOption[] = [];
  for (const r of rows) {
    const dbKey = r.accountingAccount!;
    const name = r.accountingAccountName ?? holdedById.get(dbKey) ?? holdedByNum.get(dbKey);
    if (name && !seen.has(dbKey)) {
      seen.add(dbKey);
      result.push({ num: dbKey, name, l1: l1ByNum.get(dbKey) ?? null, system: systemByNum.get(dbKey) ?? null });
    }
  }
  // Cuentas usadas en previsiones manuales (COGS/OPEX/CAPEX) aunque no tengan
  // todavía ninguna factura histórica — así son filtrables desde el primer día. Solo
  // estas tres categorías, igual que antes: el resto del catálogo contable no se
  // añade sin que haya al menos una factura detrás.
  for (const m of mappings) {
    if (!["COGS", "OPEX", "CAPEX"].includes(m.l1)) continue;
    if (m.accountNumSL && !seen.has(m.accountNumSL)) {
      seen.add(m.accountNumSL);
      result.push({ num: m.accountNumSL, name: m.accountNameSL ?? m.description, l1: m.l1, system: "SL" });
    }
    if (m.accountNumOU && !seen.has(m.accountNumOU)) {
      seen.add(m.accountNumOU);
      result.push({ num: m.accountNumOU, name: m.accountNameOU ?? m.description, l1: m.l1, system: "OU" });
    }
  }
  return result;
}

export type ForecastAccountRow = {
  accountMappingId: string;
  description: string;
  l1: string;
  marca: string | null;
  companyId: string | null;
  companyName: string | null;
  accountNumSL: string | null;
  accountNameSL: string | null;
  accountNumOU: string | null;
  accountNameOU: string | null;
  estimado: number;
  real: number;
  pendiente: number;
};

type EstimadoRow = { accountMappingId: string; marca: string | null; companyId: string | null; estimado: unknown };
type RealRow = { accountMappingId: string; marca: string | null; companyId: string | null; real: unknown };

/**
 * Tabla de previsión por cuenta contable (E5, rediseño de /forecasts, revisión
 * 2026-09-03): para cada cuenta contable (con actividad prevista o real en el
 * periodo/filtros elegidos), calcula el importe **estimado** (previsiones manuales,
 * escenario elegido), el **real** ya facturado, y lo **pendiente** (estimado − real).
 * Respeta los mismos filtros de periodo/marca/entidad/categoría/cuenta que el resto
 * de /forecasts.
 */
export async function getForecastAccountsTable(
  rawParams: CashflowParams
): Promise<ForecastAccountRow[]> {
  const l1List = rawParams.l1?.split(",").filter(Boolean) ?? [];
  const accountList = rawParams.account?.split(",").filter(Boolean) ?? [];

  const mappings = await prisma.accountMapping.findMany({
    where: {
      ...(l1List.length > 0 ? { l1: { in: l1List } } : {}),
      ...(accountList.length > 0
        ? { OR: [{ accountNumSL: { in: accountList } }, { accountNumOU: { in: accountList } }] }
        : {}),
    },
    select: {
      id: true,
      description: true,
      l1: true,
      accountNumSL: true,
      accountNameSL: true,
      accountNumOU: true,
      accountNameOU: true,
    },
  });
  if (mappings.length === 0) return [];

  const mappingById = new Map(mappings.map((m) => [m.id, m]));
  const mappingIds = mappings.map((m) => m.id);

  const dateRange = resolveDateRange(rawParams);
  const scenario = rawParams.scenario === "optimistic" ? "optimistic" : "pessimistic";
  const companies = await getCashflowCompanies();
  const companyNameById = new Map(companies.map((c) => [c.id, c.name]));

  const estimadoConditions: Prisma.Sql[] = [
    Prisma.sql`"isPaused" = false`,
    Prisma.sql`"accountMappingId" IN (${Prisma.join(mappingIds.map((id) => Prisma.sql`${id}`))})`,
    ...cashflowScopeConditions({ marca: rawParams.marca, company: rawParams.company }),
  ];
  if (dateRange.gte) estimadoConditions.push(Prisma.sql`month >= ${dateRange.gte}`);
  if (dateRange.lte) estimadoConditions.push(Prisma.sql`month <= ${dateRange.lte}`);

  const amountCol = scenario === "optimistic" ? Prisma.raw(`"amountOptimistic"`) : Prisma.raw(`"amountPessimistic"`);

  const estimadoRowsPromise = prisma.$queryRaw<EstimadoRow[]>`
    SELECT "accountMappingId", marca, "companyId", SUM(${amountCol}) AS estimado
    FROM forecasts
    WHERE ${Prisma.join(estimadoConditions, " AND ")}
    GROUP BY "accountMappingId", marca, "companyId"
  `;

  const realConditions: Prisma.Sql[] = [
    Prisma.sql`am.id IN (${Prisma.join(mappingIds.map((id) => Prisma.sql`${id}`))})`,
    ...cashflowScopeConditions({ marca: rawParams.marca, company: rawParams.company, marcaColumn: "i.marca", companyColumn: 'i."companyId"' }),
  ];
  if (dateRange.gte) realConditions.push(Prisma.sql`i.date >= ${dateRange.gte}`);
  if (dateRange.lte) realConditions.push(Prisma.sql`i.date <= ${dateRange.lte}`);

  const realRowsPromise = prisma.$queryRaw<RealRow[]>`
    SELECT am.id AS "accountMappingId", i.marca AS marca, i."companyId" AS "companyId", SUM(il."totalEur") AS real
    FROM invoice_lines il
    JOIN invoices i ON i.id = il."invoiceId"
    JOIN account_mappings am
      ON il."accountingAccount" = am."accountNumSL" OR il."accountingAccount" = am."accountNumOU"
    WHERE ${Prisma.join(realConditions, " AND ")}
    GROUP BY am.id, i.marca, i."companyId"
  `;

  const [estimadoRows, realRows] = await Promise.all([estimadoRowsPromise, realRowsPromise]);

  const rowMap = new Map<string, ForecastAccountRow>();
  const keyOf = (accountMappingId: string, marca: string | null, companyId: string | null): string =>
    `${accountMappingId}|${marca ?? ""}|${companyId ?? ""}`;

  const ensureRow = (accountMappingId: string, marca: string | null, companyId: string | null): ForecastAccountRow => {
    const key = keyOf(accountMappingId, marca, companyId);
    let row = rowMap.get(key);
    if (!row) {
      const mapping = mappingById.get(accountMappingId)!;
      row = {
        accountMappingId,
        description: mapping.description,
        l1: mapping.l1,
        marca,
        companyId,
        companyName: companyId ? (companyNameById.get(companyId) ?? null) : null,
        accountNumSL: mapping.accountNumSL,
        accountNameSL: mapping.accountNameSL,
        accountNumOU: mapping.accountNumOU,
        accountNameOU: mapping.accountNameOU,
        estimado: 0,
        real: 0,
        pendiente: 0,
      };
      rowMap.set(key, row);
    }
    return row;
  };

  for (const r of estimadoRows) {
    const row = ensureRow(r.accountMappingId, r.marca, r.companyId);
    row.estimado += Number(r.estimado);
  }
  for (const r of realRows) {
    const row = ensureRow(r.accountMappingId, r.marca, r.companyId);
    row.real += Number(r.real);
  }

  const rows = Array.from(rowMap.values());
  for (const row of rows) {
    row.pendiente = row.estimado - row.real;
  }

  // Descarta filas totalmente vacías (puede pasar si una cuenta no tuvo actividad
  // en el periodo pero coincidía con el filtro de categoría/cuenta).
  return rows
    .filter((r) => r.estimado !== 0 || r.real !== 0)
    .sort((a, b) => {
      const l1Cmp = ACCOUNT_L1_GROUP_ORDER.indexOf(a.l1 as (typeof ACCOUNT_L1_GROUP_ORDER)[number]) -
        ACCOUNT_L1_GROUP_ORDER.indexOf(b.l1 as (typeof ACCOUNT_L1_GROUP_ORDER)[number]);
      if (l1Cmp !== 0) return l1Cmp;
      return a.description.localeCompare(b.description);
    });
}
