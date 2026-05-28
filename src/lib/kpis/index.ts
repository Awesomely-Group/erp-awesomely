export type { KPIFilters, PLKPIs, CashflowKPIs, DerivedKPIs, ProjectionKPIs, KPIResponse } from "./types";
export { getPLKPIs } from "./pl";
export { getCashflowKPIs } from "./cashflow";
export { getDerivedKPIs } from "./derived";
export { getProjections } from "./projections";

import { getPLKPIs } from "./pl";
import { getCashflowKPIs } from "./cashflow";
import { getDerivedKPIs } from "./derived";
import { getProjections } from "./projections";
import { prisma } from "@/lib/prisma";
import type { KPIFilters, KPIResponse } from "./types";

export async function getAllKPIs(filters: KPIFilters): Promise<KPIResponse> {
  const [pl, cashflow, derived, projections, unclassifiedCount] = await Promise.all([
    getPLKPIs(filters),
    getCashflowKPIs(filters),
    getDerivedKPIs(filters),
    getProjections(filters),
    prisma.invoice.count({
      where: {
        holdedStatus: { not: -1 },
        lines: { some: { accountingAccount: null } },
      },
    }),
  ]);

  return {
    pl,
    cashflow,
    derived,
    projections,
    dataQuality: { unclassifiedCount },
    generatedAt: new Date().toISOString(),
  };
}
