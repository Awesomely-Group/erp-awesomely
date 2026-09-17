import { authenticateRequest, unauthorized, notFound, json } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { invoiceDetailSelect, toInvoiceDetail } from "@/lib/invoice-detail";

/**
 * Detalle de una factura del ERP. Lo consume el panel de vista previa de Pagos
 * cuando Holded no tiene PDF que servir (las facturas de compra solo tienen
 * documento si alguien adjuntó el escaneado).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!(await authenticateRequest(req))) return unauthorized();

  const { id } = await params;

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    select: invoiceDetailSelect,
  });
  if (!invoice) return notFound("Factura no encontrada");

  return json(toInvoiceDetail(invoice));
}
