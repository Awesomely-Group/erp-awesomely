import { getCashflowData } from "./cashflow-data";

export type ProjectionPoint = {
  monthKey: string;
  monthLabel: string;
  baselineInflows: number;
  baselineOutflows: number;
  baselineNet: number;
  optimisticInflows: number;
  optimisticOutflows: number;
  optimisticNet: number;
  pessimisticInflows: number;
  pessimisticOutflows: number;
  pessimisticNet: number;
};

export type HorizonKpi = {
  months: 3 | 6 | 9 | 12;
  baselineNet: number;
  optimisticNet: number;
  pessimisticNet: number;
  baselineInflows: number;
  baselineOutflows: number;
};

export type ProjectionParams = {
  basePeriod?: string;
  margin?: string;
  marca?: string;
  companyId?: string;
};

export async function getProjectionData(params: ProjectionParams): Promise<{
  projections: ProjectionPoint[];
  horizons: HorizonKpi[];
  avgInflows: number;
  avgOutflows: number;
  windowMonths: number;
}> {
  const { monthly } = await getCashflowData({
    marca: params.marca,
    company: params.companyId !== "consolidated" ? params.companyId : undefined,
  }, false);

  const rawN = parseInt(params.basePeriod ?? "6", 10);
  const n = Math.min(isNaN(rawN) ? 6 : rawN, monthly.length) || 6;

  const rawMargin = parseInt(params.margin ?? "20", 10);
  const marginFrac = Math.min(Math.max(isNaN(rawMargin) ? 20 : rawMargin, 0), 50) / 100;

  const win = monthly.slice(-n);
  const avgInflows  = win.reduce((s, p) => s + p.inflows,  0) / (win.length || 1);
  const avgOutflows = win.reduce((s, p) => s + p.outflows, 0) / (win.length || 1);

  const now = new Date();
  const projections: ProjectionPoint[] = [];

  for (let i = 1; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const monthLabel = d.toLocaleDateString("es-ES", { month: "short", year: "numeric" });

    const optIn  = avgInflows  * (1 + marginFrac);
    const optOut = avgOutflows * (1 - marginFrac);
    const pesIn  = avgInflows  * (1 - marginFrac);
    const pesOut = avgOutflows * (1 + marginFrac);

    projections.push({
      monthKey,
      monthLabel,
      baselineInflows:   avgInflows,
      baselineOutflows:  avgOutflows,
      baselineNet:       avgInflows  - avgOutflows,
      optimisticInflows: optIn,
      optimisticOutflows: optOut,
      optimisticNet:     optIn - optOut,
      pessimisticInflows:  pesIn,
      pessimisticOutflows: pesOut,
      pessimisticNet:    pesIn - pesOut,
    });
  }

  const horizons = ([3, 6, 9, 12] as const).map((months) => {
    const slice = projections.slice(0, months);
    return {
      months,
      baselineNet:     slice.reduce((s, p) => s + p.baselineNet,     0),
      optimisticNet:   slice.reduce((s, p) => s + p.optimisticNet,   0),
      pessimisticNet:  slice.reduce((s, p) => s + p.pessimisticNet,  0),
      baselineInflows: slice.reduce((s, p) => s + p.baselineInflows,  0),
      baselineOutflows: slice.reduce((s, p) => s + p.baselineOutflows, 0),
    };
  });

  return { projections, horizons, avgInflows, avgOutflows, windowMonths: win.length };
}
