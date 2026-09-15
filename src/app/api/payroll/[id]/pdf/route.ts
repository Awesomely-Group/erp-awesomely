import { authenticateRequest, unauthorized, notFound } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { HoldedClient, HoldedApiError } from "@/lib/holded";

/**
 * Proxy del PDF de una nómina — pedido a Holded al vuelo, nunca guardado en nuestra BD
 * (E15, 2026-09-15). Usa el módulo Team de Holded (`/salary-records/{id}/pdf`), separado
 * de invoices/purchases.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!(await authenticateRequest(req))) return unauthorized();

  const { id } = await params;

  const salaryRecord = await prisma.salaryRecord.findUnique({
    where: { id },
    select: {
      holdedSalaryRecordId: true,
      company: { select: { holdedApiKey: true } },
    },
  });
  if (!salaryRecord) return notFound("Nómina no encontrada");

  const client = new HoldedClient(salaryRecord.company.holdedApiKey);

  try {
    const { buffer, contentType } = await client.getSalaryRecordPdf(
      salaryRecord.holdedSalaryRecordId,
    );
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: { "Content-Type": contentType, "Cache-Control": "no-store" },
    });
  } catch (err) {
    if (err instanceof HoldedApiError) {
      return notFound(`No se pudo obtener el PDF desde Holded (${err.status})`);
    }
    console.error(`[api] payroll/${id}/pdf:`, err);
    return notFound("No se pudo obtener el PDF desde Holded");
  }
}
