export type { KPIFilters, PLKPIs, CashflowKPIs, DerivedKPIs, ProjectionKPIs, KPIResponse } from "./types";
export { getPLKPIs } from "./pl";
export { getCashflowKPIs } from "./cashflow";
export { getDerivedKPIs } from "./derived";
export { getProjections } from "./projections";

import type { Prisma } from "@prisma/client";
import { getPLKPIs } from "./pl";
import { getCashflowKPIs } from "./cashflow";
import { getDerivedKPIs } from "./derived";
import { getProjections } from "./projections";
import { prisma } from "@/lib/prisma";
import { invoiceWhereMarca } from "@/lib/org";
import type { KPIFilters, KPIResponse } from "./types";

function getDataQualityWhere(filters: KPIFilters): Prisma.InvoiceWhereInput {
  const year = filters.year ?? new Date().getFullYear();
  const date =
    filters.dateFrom || filters.dateTo
      ? {
          ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
          ...(filters.dateTo ? { lte: filters.dateTo } : {}),
        }
      : {
          gte: new Date(year, 0, 1),
          lt: new Date(year + 1, 0, 1),
        };

  return {
    holdedStatus: { not: -1 },
    lines: { some: { accountingAccount: null } },
    date,
    ...(filters.companyId && filters.companyId !== "consolidated"
      ? { companyId: filters.companyId }
      : {}),
    ...invoiceWhereMarca(filters.marca),
  };
}

export async function getAllKPIs(filters: KPIFilters): Promise<KPIResponse> {
  const [pl, cashflow, derived, projections, unclassifiedCount] = await Promise.all([
    getPLKPIs(filters),
    getCashflowKPIs(filters),
    getDerivedKPIs(filters),
    getProjections(filters),
    prisma.invoice.count({
      where: getDataQualityWhere(filters),
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
