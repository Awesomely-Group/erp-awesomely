import { prisma } from "./prisma";

const COMPANY_SL = "cmnbew1zp000004l6pjz4wp0y";
const COMPANY_OU = "cmnbex183000204l625mrpus9";

// Dec 31 2025 opening balance (validated vs bank statement Jun-2026)
const OPENING_DEC2025: Record<"SL" | "OU", number> = {
  SL: 37357,
  OU: 12309,
};

// Hardcoded PREVISIÓN Jul–Dec 2026 (source: ~/awesomely-finanzas/Tesoreria_2026.xlsx)
type PrevMes = {
  cobros: number;
  cobrosAsegurado: number;
  cobrosEstimado: number;
  pagos: number;
  pagosEstructura: number;
  pagosExtraordinarios: number;
  pagosVariable: number;
};

const PREVISION: Record<"SL" | "OU", PrevMes[]> = {
  // indices 0..5 = Jul..Dic
  SL: [
    { cobros: 19586, cobrosAsegurado:  3750, cobrosEstimado: 15836, pagos: -40518, pagosEstructura: -6066, pagosExtraordinarios: -20473, pagosVariable: -13979 },
    { cobros: 19586, cobrosAsegurado:  3750, cobrosEstimado: 15836, pagos: -20045, pagosEstructura: -6066, pagosExtraordinarios:      0, pagosVariable: -13979 },
    { cobros: 19586, cobrosAsegurado:  3750, cobrosEstimado: 15836, pagos: -20045, pagosEstructura: -6066, pagosExtraordinarios:      0, pagosVariable: -13979 },
    { cobros: 19586, cobrosAsegurado:  3750, cobrosEstimado: 15836, pagos: -20045, pagosEstructura: -6066, pagosExtraordinarios:      0, pagosVariable: -13979 },
    { cobros: 19586, cobrosAsegurado:  3750, cobrosEstimado: 15836, pagos: -20045, pagosEstructura: -6066, pagosExtraordinarios:      0, pagosVariable: -13979 },
    { cobros: 19586, cobrosAsegurado:     0, cobrosEstimado: 19586, pagos: -20045, pagosEstructura: -6066, pagosExtraordinarios:      0, pagosVariable: -13979 },
  ],
  OU: [
    { cobros: 19786, cobrosAsegurado:  2667, cobrosEstimado: 17119, pagos: -25094, pagosEstructura: -3612, pagosExtraordinarios:  -4200, pagosVariable: -17282 },
    { cobros: 19786, cobrosAsegurado:  2667, cobrosEstimado: 17119, pagos: -20894, pagosEstructura: -3612, pagosExtraordinarios:      0, pagosVariable: -17282 },
    { cobros: 19786, cobrosAsegurado:  2667, cobrosEstimado: 17119, pagos: -20894, pagosEstructura: -3612, pagosExtraordinarios:      0, pagosVariable: -17282 },
    { cobros: 19786, cobrosAsegurado:  2667, cobrosEstimado: 17119, pagos: -20894, pagosEstructura: -3612, pagosExtraordinarios:      0, pagosVariable: -17282 },
    { cobros: 19786, cobrosAsegurado:  2667, cobrosEstimado: 17119, pagos: -20894, pagosEstructura: -3612, pagosExtraordinarios:      0, pagosVariable: -17282 },
    { cobros: 19786, cobrosAsegurado:     0, cobrosEstimado: 19786, pagos: -20894, pagosEstructura: -3612, pagosExtraordinarios:      0, pagosVariable: -17282 },
  ],
};

const MONTH_LABELS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const REAL_MONTHS = 6; // ene–jun are REAL

type RawRow = { month: Date; invoice_type: string; total_eur: unknown };

export type TesoreriaMonth = {
  monthKey: string;
  monthLabel: string;
  isReal: boolean;
  cobros: number;
  cobrosAsegurado: number | null;
  cobrosEstimado: number | null;
  pagos: number;
  pagosEstructura: number | null;
  pagosExtraordinarios: number | null;
  pagosVariable: number | null;
  flujoNeto: number;
  saldoCaja: number;
};

export type TesoreriaEntityData = {
  months: TesoreriaMonth[];
  totalCobros: number;
  totalPagos: number;
  totalFlujo: number;
};

export type TesoreriaData = {
  SL: TesoreriaEntityData;
  OU: TesoreriaEntityData;
  Consolidado: TesoreriaEntityData;
};

async function fetchEntityCashflow(
  companyId: string
): Promise<Map<string, { cobros: number; pagos: number }>> {
  const rows = await prisma.$queryRaw<RawRow[]>`
    SELECT
      DATE_TRUNC('month', date)  AS month,
      type                       AS invoice_type,
      SUM("totalEur")            AS total_eur
    FROM invoices
    WHERE "companyId" = ${companyId}
      AND date >= ${new Date("2026-01-01")}
      AND date <  ${new Date("2026-07-01")}
    GROUP BY DATE_TRUNC('month', date), type
    ORDER BY month ASC
  `;

  const map = new Map<string, { cobros: number; pagos: number }>();
  for (const row of rows) {
    const d = new Date(row.month);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const cur = map.get(key) ?? { cobros: 0, pagos: 0 };
    const amount = Number(row.total_eur);
    if (row.invoice_type === "SALE") cur.cobros += amount;
    else cur.pagos += amount;
    map.set(key, cur);
  }
  return map;
}

function buildEntityData(
  entity: "SL" | "OU",
  realData: Map<string, { cobros: number; pagos: number }>
): TesoreriaEntityData {
  const months: TesoreriaMonth[] = [];
  let saldo = OPENING_DEC2025[entity];

  for (let i = 0; i < 12; i++) {
    const num = i + 1;
    const monthKey = `2026-${String(num).padStart(2, "0")}`;
    const isReal = i < REAL_MONTHS;

    let cobros: number;
    let pagos: number;
    let cobrosAsegurado: number | null = null;
    let cobrosEstimado: number | null = null;
    let pagosEstructura: number | null = null;
    let pagosExtraordinarios: number | null = null;
    let pagosVariable: number | null = null;

    if (isReal) {
      const r = realData.get(monthKey) ?? { cobros: 0, pagos: 0 };
      cobros = r.cobros;
      pagos = -r.pagos; // DB stores PURCHASE totalEur as positive; flip sign for display
    } else {
      const p = PREVISION[entity][i - REAL_MONTHS];
      cobros = p.cobros;
      pagos = p.pagos;
      cobrosAsegurado = p.cobrosAsegurado;
      cobrosEstimado = p.cobrosEstimado;
      pagosEstructura = p.pagosEstructura;
      pagosExtraordinarios = p.pagosExtraordinarios;
      pagosVariable = p.pagosVariable;
    }

    const flujoNeto = cobros + pagos;
    saldo += flujoNeto;

    months.push({
      monthKey,
      monthLabel: MONTH_LABELS[i],
      isReal,
      cobros,
      cobrosAsegurado,
      cobrosEstimado,
      pagos,
      pagosEstructura,
      pagosExtraordinarios,
      pagosVariable,
      flujoNeto,
      saldoCaja: saldo,
    });
  }

  return {
    months,
    totalCobros: months.reduce((s, m) => s + m.cobros, 0),
    totalPagos: months.reduce((s, m) => s + m.pagos, 0),
    totalFlujo: months.reduce((s, m) => s + m.flujoNeto, 0),
  };
}

export async function getTesoreriaData(): Promise<TesoreriaData> {
  const [slMap, ouMap] = await Promise.all([
    fetchEntityCashflow(COMPANY_SL),
    fetchEntityCashflow(COMPANY_OU),
  ]);

  const SL = buildEntityData("SL", slMap);
  const OU = buildEntityData("OU", ouMap);

  const consolMonths: TesoreriaMonth[] = SL.months.map((sl, i) => {
    const ou = OU.months[i];
    const cobros = sl.cobros + ou.cobros;
    const pagos = sl.pagos + ou.pagos;
    const flujoNeto = cobros + pagos;
    return {
      monthKey: sl.monthKey,
      monthLabel: sl.monthLabel,
      isReal: sl.isReal,
      cobros,
      cobrosAsegurado: sl.cobrosAsegurado !== null ? sl.cobrosAsegurado + (ou.cobrosAsegurado ?? 0) : null,
      cobrosEstimado: sl.cobrosEstimado !== null ? sl.cobrosEstimado + (ou.cobrosEstimado ?? 0) : null,
      pagos,
      pagosEstructura: sl.pagosEstructura !== null ? sl.pagosEstructura + (ou.pagosEstructura ?? 0) : null,
      pagosExtraordinarios: sl.pagosExtraordinarios !== null ? sl.pagosExtraordinarios + (ou.pagosExtraordinarios ?? 0) : null,
      pagosVariable: sl.pagosVariable !== null ? sl.pagosVariable + (ou.pagosVariable ?? 0) : null,
      flujoNeto,
      saldoCaja: sl.saldoCaja + ou.saldoCaja,
    };
  });

  const Consolidado: TesoreriaEntityData = {
    months: consolMonths,
    totalCobros: SL.totalCobros + OU.totalCobros,
    totalPagos: SL.totalPagos + OU.totalPagos,
    totalFlujo: SL.totalFlujo + OU.totalFlujo,
  };

  return { SL, OU, Consolidado };
}
