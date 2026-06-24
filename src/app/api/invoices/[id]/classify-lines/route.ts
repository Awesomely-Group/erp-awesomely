import { authenticateRequest, unauthorized, badRequest, notFound, json } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { AuditAction, ClassificationStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { deriveMarcaFromClassifications } from "@/lib/invoice-marca";

interface LineInput {
  lineId: string;
  projectId: string | null;
  marca: string | null;
  notes: string;
}

/**
 * Per-line classification.
 *
 * Unlike `POST /api/invoices/[id]/classify` (which assigns ALL lines of an
 * invoice to a single project), this endpoint classifies each line
 * independently, so a mixed invoice (e.g. several lines for different
 * projects + an internal line) can be split correctly.
 *
 * Body: { lines: [{ lineId, projectId?, marca?, notes? }] }
 * Auth: x-api-key header or an authenticated session (same as the bulk route).
 */
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

  const rawLines = (body as Record<string, unknown>)?.lines;
  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    return badRequest("Se requiere 'lines': [{ lineId, projectId }]");
  }

  const parsed: LineInput[] = [];
  for (const raw of rawLines) {
    const l = (raw ?? {}) as Record<string, unknown>;
    if (typeof l.lineId !== "string") {
      return badRequest("Cada línea requiere 'lineId' (string)");
    }
    if (l.projectId !== undefined && l.projectId !== null && typeof l.projectId !== "string") {
      return badRequest("'projectId' debe ser string o null");
    }
    if (l.marca !== undefined && l.marca !== null && typeof l.marca !== "string") {
      return badRequest("'marca' debe ser string o null");
    }
    parsed.push({
      lineId: l.lineId,
      projectId: (l.projectId as string | null | undefined) ?? null,
      marca: (l.marca as string | null | undefined) ?? null,
      notes: typeof l.notes === "string" ? l.notes : "",
    });
  }

  // Ensure the invoice exists and every lineId actually belongs to it.
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { lines: { select: { id: true } } },
  });
  if (!invoice) return notFound("Factura no encontrada");

  const validLineIds = new Set(invoice.lines.map((l) => l.id));
  const invalid = parsed.filter((l) => !validLineIds.has(l.lineId));
  if (invalid.length > 0) {
    return badRequest(
      `Líneas que no pertenecen a la factura ${invoiceId}: ${invalid
        .map((l) => l.lineId)
        .join(", ")}`
    );
  }

  const session = await auth();
  const classifiedBy = session?.user?.email ?? session?.user?.id ?? "api";

  // Upsert one classification per line.
  await prisma.$transaction(
    parsed.map((l) =>
      prisma.classification.upsert({
        where: { invoiceLineId: l.lineId },
        create: {
          invoiceLineId: l.lineId,
          projectId: l.projectId ?? null,
          marca: l.marca ?? null,
          notes: l.notes || null,
          status: ClassificationStatus.CLASSIFIED,
          classifiedBy,
          classifiedAt: new Date(),
        },
        update: {
          projectId: l.projectId ?? null,
          marca: l.marca ?? null,
          notes: l.notes || null,
          status: ClassificationStatus.CLASSIFIED,
          classifiedBy,
          classifiedAt: new Date(),
        },
      })
    )
  );

  // Recalculate the invoice marca from all of its (non-ignored) classifications.
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

  await prisma.auditLog.create({
    data: {
      userId: session?.user?.id ?? null,
      action: AuditAction.CLASSIFY,
      entityType: "Invoice",
      entityId: invoiceId,
      newValue: {
        perLine: parsed.map((l) => ({ lineId: l.lineId, projectId: l.projectId, marca: l.marca })),
      },
      invoiceId,
    },
  });

  return json({ classified: parsed.length, invoiceId, marca: derivedMarca });
}
