import { getProjectionData } from "@/lib/projection-data";
import type { KPIFilters, ProjectionKPIs } from "./types";

export async function getProjections(filters: KPIFilters): Promise<ProjectionKPIs> {
  const { horizons, avgInflows, avgOutflows, windowMonths } = await getProjectionData({
    marca: filters.marca,
  });

  return {
    basePeriodMonths: windowMonths,
    variationPct: 20,
    avgInflows,
    avgOutflows,
    horizons: horizons as ProjectionKPIs["horizons"],
  };
}
