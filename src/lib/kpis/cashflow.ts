import { getCashflowData } from "@/lib/cashflow-data";
import type { KPIFilters, CashflowKPIs } from "./types";

export async function getCashflowKPIs(filters: KPIFilters): Promise<CashflowKPIs> {
  const dateFrom = filters.dateFrom?.toISOString().slice(0, 10);
  const dateTo = filters.dateTo?.toISOString().slice(0, 10);

  const params = {
    period: (dateFrom ?? dateTo) ? "custom" : "last_12_months",
    dateFrom,
    dateTo,
    marca: filters.marca,
    company: filters.companyId !== "consolidated" ? filters.companyId : undefined,
  };

  const { monthly, kpis } = await getCashflowData(params, false);

  let cumulative = 0;
  const monthlyWithCumulative = monthly.map((m) => {
    cumulative += m.net;
    return {
      monthKey: m.monthKey,
      monthLabel: m.monthLabel,
      inflows: m.inflows,
      outflows: m.outflows,
      net: m.net,
      cumulativeNet: cumulative,
    };
  });

  const coverage =
    kpis.totalOutflows !== 0 ? kpis.totalInflows / Math.abs(kpis.totalOutflows) : null;

  const resolvedFrom =
    dateFrom ??
    (monthly.length > 0 ? monthly[0].monthKey + "-01" : new Date().toISOString().slice(0, 10));
  const resolvedTo =
    dateTo ??
    (monthly.length > 0
      ? monthly[monthly.length - 1].monthKey + "-01"
      : new Date().toISOString().slice(0, 10));

  return {
    dateFrom: resolvedFrom,
    dateTo: resolvedTo,
    totalInflows: kpis.totalInflows,
    totalOutflows: kpis.totalOutflows,
    netCashflow: kpis.netCashflow,
    operationalCoverage: coverage,
    monthly: monthlyWithCumulative,
  };
}
