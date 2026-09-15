import { authenticateRequest, unauthorized, notFound } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { HoldedClient, HoldedApiError } from "@/lib/holded";

/**
 * Proxy del PDF de una factura — pedido a Holded al vuelo, nunca guardado en nuestra BD
 * (E14/E15, 2026-09-15). Ventas: Holded genera el PDF bajo demanda (`/invoices/{id}/pdf`).
 * Compras: no existe `/pdf` en la API de Holded — el documento real es el fichero
 * subido/escaneado (adjunto), se sirve el primero que haya.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!(await authenticateRequest(req))) return unauthorized();

  const { id } = await params;

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    select: {
      holdedId: true,
      type: true,
      company: { select: { holdedApiKey: true } },
    },
  });
  if (!invoice) return notFound("Factura no encontrada");

  const client = new HoldedClient(invoice.company.holdedApiKey);

  try {
    if (invoice.type === "SALE") {
      const { buffer, contentType } = await client.getInvoicePdf(
        invoice.holdedId,
      );
      return new Response(new Uint8Array(buffer), {
        status: 200,
        headers: { "Content-Type": contentType, "Cache-Control": "no-store" },
      });
    }

    const attachments = await client.getPurchaseAttachments(invoice.holdedId);
    if (attachments.length === 0) {
      return notFound(
        "Esta factura de compra no tiene ningún documento adjunto en Holded",
      );
    }
    const { buffer, contentType } = await client.getPurchaseAttachment(
      invoice.holdedId,
      attachments[0].id,
    );
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: { "Content-Type": contentType, "Cache-Control": "no-store" },
    });
  } catch (err) {
    if (err instanceof HoldedApiError) {
      return notFound(`No se pudo obtener el PDF desde Holded (${err.status})`);
    }
    console.error(`[api] invoices/${id}/pdf:`, err);
    return notFound("No se pudo obtener el PDF desde Holded");
  }
}
