import { apiError, apiOk, apiRoute, companyWhere, marcaWhere } from "@/lib/api/v1";
import { prisma } from "@/lib/prisma";

/**
 * Una factura con sus líneas y su clasificación.
 *
 * El `where` lleva la frontera de la credencial además del id: pedir por id una factura
 * de una sociedad fuera de alcance responde 404, igual que una que no existe. Es la
 * misma regla que en Giro — no se filtra qué existe fuera de tu alcance.
 */
export const GET = apiRoute<{ params: Promise<{ id: string }> }>(
  async (_request, ctx, { params }) => {
    const { id } = await params;

    const invoice = await prisma.invoice.findFirst({
      where: { id, ...companyWhere(ctx), ...marcaWhere(ctx) },
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
        lines: {
          select: {
            id: true,
            description: true,
            totalEur: true,
            classification: { select: { projectId: true, marca: true } },
          },
        },
      },
    });

    if (!invoice) return apiError(404, "not_found", "Esa factura no existe");

    return apiOk({
      ...invoice,
      date: invoice.date.toISOString().slice(0, 10),
      accountingMonth: invoice.accountingMonth
        ? invoice.accountingMonth.toISOString().slice(0, 7)
        : null,
      dueDate: invoice.dueDate ? invoice.dueDate.toISOString().slice(0, 10) : null,
      total: Number(invoice.total),
      totalEur: Number(invoice.totalEur),
      paymentsTotal: Number(invoice.paymentsTotal),
      paymentsPending: Number(invoice.paymentsPending),
      lines: invoice.lines.map((line) => ({
        id: line.id,
        description: line.description,
        totalEur: Number(line.totalEur),
        projectId: line.classification?.projectId ?? null,
        marca: line.classification?.marca ?? null,
      })),
    });
  },
  { scope: "invoices:read" },
);
