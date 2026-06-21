import { authenticateRequest, unauthorized, badRequest, notFound, json } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { AuditAction, ClassificationStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { deriveMarcaFromClassifications } from "@/lib/invoice-marca";
import { updateInvoiceStatus } from "@/lib/sync";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  if (!(await authenticateRequest(req))) return unauthorized();

  const { id: invoiceId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Body JSON inválido");
  }

  const { projectId = null, marca = null, notes = "" } = (body as Record<string, unknown>) ?? {};

  if (typeof projectId !== "string" && projectId !== null) {
    return badRequest("projectId debe ser string o null");
  }
  if (typeof marca !== "string" && marca !== null) {
    return badRequest("marca debe ser string o null");
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { lines: { select: { id: true } } },
  });
  if (!invoice) return notFound("Factura no encontrada");
  if (invoice.lines.length === 0) return badRequest("La factura no tiene líneas");

  const session = await auth();
  const classifiedBy = session?.user?.email ?? session?.user?.id ?? "api";

  // Upsert classification for every line
  await prisma.$transaction(
    invoice.lines.map((line) =>
      prisma.classification.upsert({
        where: { invoiceLineId: line.id },
        create: {
          invoiceLineId: line.id,
          projectId: projectId ?? null,
          marca: marca ?? null,
          notes: typeof notes === "string" ? notes || null : null,
          status: ClassificationStatus.CLASSIFIED,
          classifiedBy,
          classifiedAt: new Date(),
        },
        update: {
          projectId: projectId ?? null,
          marca: marca ?? null,
          notes: typeof notes === "string" ? notes || null : null,
          status: ClassificationStatus.CLASSIFIED,
          classifiedBy,
          classifiedAt: new Date(),
        },
      })
    )
  );

  // Recalculate invoice marca from its classifications
  const classifications = await prisma.classification.findMany({
    where: {
      invoiceLine: { invoiceId },
      status: { not: ClassificationStatus.IGNORED },
    },
    include: {
      invoiceLine: true,
      project: { include: { workspace: { select: { name: true } } } },
    },
  });
  const derivedMarca = deriveMarcaFromClassifications(classifications);
  await prisma.invoice.update({ where: { id: invoiceId }, data: { marca: derivedMarca } });

  // Recalculate invoice.status now that marca is persisted
  await updateInvoiceStatus(invoiceId);

  await prisma.auditLog.create({
    data: {
      userId: session?.user?.id ?? null,
      action: AuditAction.CLASSIFY,
      entityType: "Invoice",
      entityId: invoiceId,
      newValue: { projectId, marca, linesClassified: invoice.lines.length },
      invoiceId,
    },
  });

  return json({ classified: invoice.lines.length, projectId, marca });
}
