import { prisma } from "@/lib/prisma";
import { getPLKPIs } from "./pl";
import type { KPIFilters, DerivedKPIs } from "./types";

export async function getDerivedKPIs(filters: KPIFilters): Promise<DerivedKPIs> {
  const year = filters.year ?? new Date().getFullYear();
  const now = new Date();

  // Months elapsed in the given year (1–12, capped at current month if same year)
  const monthsElapsed =
    year < now.getFullYear()
      ? 12
      : year === now.getFullYear()
        ? Math.max(now.getMonth(), 1)
        : 1;

  const startOfYear = new Date(year, 0, 1);
  const endOfYear = new Date(year + 1, 0, 1);

  const [plResults, counts] = await Promise.all([
    getPLKPIs({ ...filters, year }),
    prisma.$transaction([
      // Unclassified: invoices with at least one line without accountingAccount
      prisma.$queryRaw<[{ count: bigint; total: unknown }]>`
        SELECT COUNT(DISTINCT i.id)::int AS count, COALESCE(SUM(i."totalEur"), 0) AS total
        FROM invoices i
        WHERE EXISTS (
          SELECT 1 FROM invoice_lines il
          WHERE il."invoiceId" = i.id AND il."accountingAccount" IS NULL
        )
        AND (i."holdedStatus" IS NULL OR i."holdedStatus" != -1)
        AND i.date >= ${startOfYear} AND i.date < ${endOfYear}
      `,
      // Pending collection
      prisma.$queryRaw<[{ count: bigint; total: unknown }]>`
        SELECT COUNT(*)::int AS count, COALESCE(SUM("totalEur"), 0) AS total
        FROM invoices
        WHERE type::text = 'SALE'
          AND status::text = 'PENDING'
          AND (("holdedStatus" IS NULL OR "holdedStatus" != -1))
          AND date >= ${startOfYear} AND date < ${endOfYear}
      `,
      // Pending payment
      prisma.$queryRaw<[{ count: bigint; total: unknown }]>`
        SELECT COUNT(*)::int AS count, COALESCE(SUM("totalEur"), 0) AS total
        FROM invoices
        WHERE type::text = 'PURCHASE'
          AND status::text = 'PENDING'
          AND (("holdedStatus" IS NULL OR "holdedStatus" != -1))
          AND date >= ${startOfYear} AND date < ${endOfYear}
      `,
    ]),
  ]);

  const [unclassifiedRows, pendingCollectionRows, pendingPaymentRows] = counts;

  const consolidated = plResults.find((p) => p.companyId === "consolidated") ?? plResults[0];

  const ventasYTD = consolidated?.ventas ?? 0;
  const resultadoYTD = consolidated?.resultadoEjercicio ?? 0;

  return {
    year,
    monthsElapsed,
    annualRunRate: monthsElapsed > 0 ? (ventasYTD / monthsElapsed) * 12 : null,
    monthlyBurnRate: monthsElapsed > 0 ? resultadoYTD / monthsElapsed : null,
    unclassifiedInvoices: {
      count: Number(unclassifiedRows[0]?.count ?? 0),
      totalEur: Number(unclassifiedRows[0]?.total ?? 0),
    },
    pendingCollection: {
      count: Number(pendingCollectionRows[0]?.count ?? 0),
      totalEur: Number(pendingCollectionRows[0]?.total ?? 0),
    },
    pendingPayment: {
      count: Number(pendingPaymentRows[0]?.count ?? 0),
      totalEur: Number(pendingPaymentRows[0]?.total ?? 0),
    },
  };
}
