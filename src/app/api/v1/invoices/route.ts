import type { ApiInvoice } from "@/contracts";
import { apiRoute, companyWhere, dateParam, marcaWhere, narrowCompanyFilter, page, paged } from "@/lib/api/v1";
import { prisma } from "@/lib/prisma";

/**
 * Facturas de venta y compra.
 *
 * Dos filtros no son opcionales y no vienen del cliente: la sociedad y la marca salen
 * de la credencial. El `?companyId=` que sí se acepta solo puede **acotar** dentro de
 * lo permitido; pedir una sociedad fuera de alcance devuelve vacío, no 403 —
 * distinguirlos diría qué sociedades existen a quien no debería saberlo.
 *
 * `removedFromHoldedAt: null` además de `holdedStatus != -1`: una factura borrada en
 * Holded no debe reaparecer por API. La ruta antigua filtraba solo por lo primero y el
 * tool de MCP ni eso, que era una incoherencia entre dos puertas al mismo dato.
 */
export const GET = apiRoute(async (request, ctx) => {
  const url = new URL(request.url);
  const p = page(url);
  if (p instanceof Response) return p;

  const desde = dateParam(url, "dateFrom");
  if (desde instanceof Response) return desde;
  const hasta = dateParam(url, "dateTo");
  if (hasta instanceof Response) return hasta;

  const type = url.searchParams.get("type");
  const status = url.searchParams.get("status");
  const companyId = narrowCompanyFilter(ctx, url.searchParams.get("companyId"));

  const where = {
    holdedStatus: { not: -1 },
    removedFromHoldedAt: null,
    ...(type ? { type: type as never } : {}),
    ...(status ? { status: status as never } : {}),
    ...(desde || hasta
      ? { date: { ...(desde ? { gte: desde } : {}), ...(hasta ? { lte: hasta } : {}) } }
      : {}),
    ...companyWhere(ctx),
    ...marcaWhere(ctx),
    ...(companyId === undefined ? {} : { companyId }),
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
        companyId: true,
        accountingMonth: true,
        paymentsTotal: true,
        paymentsPending: true,
        _count: { select: { lines: true } },
      },
      orderBy: { date: "desc" },
      skip: p.offset,
      take: p.limit,
    }),
    prisma.invoice.count({ where }),
  ]);

  const body: ApiInvoice[] = invoices.map((invoice) => ({
    id: invoice.id,
    holdedId: invoice.holdedId,
    number: invoice.number,
    type: invoice.type,
    status: invoice.status,
    date: invoice.date.toISOString().slice(0, 10),
    dueDate: invoice.dueDate ? invoice.dueDate.toISOString().slice(0, 10) : null,
    counterparty: invoice.counterparty,
    currency: invoice.currency,
    total: Number(invoice.total),
    totalEur: Number(invoice.totalEur),
    marca: invoice.marca,
    companyId: invoice.companyId,
    // Mes contable: es un mes, no un instante. Se sirve como `YYYY-MM` para que nadie
    // tenga que decidir qué significa la hora que lleva dentro.
    accountingMonth: invoice.accountingMonth
      ? invoice.accountingMonth.toISOString().slice(0, 7)
      : null,
    paymentsTotal: Number(invoice.paymentsTotal),
    paymentsPending: Number(invoice.paymentsPending),
    lineCount: invoice._count.lines,
  }));

  return paged(body, total, p);
}, { scope: "invoices:read" });
