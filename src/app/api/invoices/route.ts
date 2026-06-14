import { authenticateRequest, unauthorized, json } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { invoiceWhereMarca } from "@/lib/org";
import type { InvoiceStatus, InvoiceType } from "@prisma/client";

export async function GET(req: Request): Promise<Response> {
  if (!(await authenticateRequest(req))) return unauthorized();

  const url = new URL(req.url);
  const type = url.searchParams.get("type") as InvoiceType | null;
  const status = url.searchParams.get("status") as InvoiceStatus | null;
  const marca = url.searchParams.get("marca") ?? undefined;
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10)));

  const marcaFilter = invoiceWhereMarca(marca);

  const where = {
    holdedStatus: { not: -1 },
    removedFromHoldedAt: null,
    ...(type ? { type } : {}),
    ...(status ? { status } : {}),
    ...(dateFrom || dateTo
      ? {
          date: {
            ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
            ...(dateTo ? { lte: new Date(dateTo) } : {}),
          },
        }
      : {}),
    ...marcaFilter,
  };

  const [invoices, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      select: {
        id: true,
        holdedId: true,
        number: true,
        type: true,
        status: true,
        date: true,
        dueDate: true,
        counterparty: true,
        currency: true,
        total: true,
        totalEur: true,
        marca: true,
        accountingMonth: true,
        paymentsTotal: true,
        paymentsPending: true,
        _count: { select: { lines: true } },
      },
      orderBy: { date: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.invoice.count({ where }),
  ]);

  return json({
    data: invoices,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}
