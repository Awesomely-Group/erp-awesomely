import { json, unauthorized, notFound, badRequest } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { authenticateProposalWebhook, BRAND_TO_SOURCE_PLATFORM } from "@/lib/proposals-brand";

/**
 * Estado de una propuesta para que gigsonapps.com/latroupeapps.com puedan mostrarlo sin
 * llamar a Documenso directamente. Auth igual que en `POST /api/webhooks/proposals`
 * (`x-webhook-secret` + `?brand=`), y además se verifica que el Budget pertenezca a esa
 * misma plataforma (evita que un secreto de una marca consulte propuestas de la otra).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ budgetId: string }> }
): Promise<Response> {
  const { budgetId } = await params;
  const brand = new URL(req.url).searchParams.get("brand");

  if (!authenticateProposalWebhook(req, brand)) return unauthorized();
  if (!budgetId) return badRequest("budgetId es obligatorio");

  const budget = await prisma.budget.findUnique({
    where: { id: budgetId },
    select: {
      id: true,
      status: true,
      sourcePlatform: true,
      documensoDocumentId: true,
      documensoStatus: true,
      holdedDocId: true,
      holdedSyncedAt: true,
    },
  });

  if (!budget || budget.sourcePlatform !== BRAND_TO_SOURCE_PLATFORM[brand as "SOLUTIONS" | "TROUPE"]) {
    return notFound("Presupuesto no encontrado");
  }

  return json({
    budgetId: budget.id,
    status: budget.status,
    documensoStatus: budget.documensoStatus,
    documensoDocumentId: budget.documensoDocumentId,
    holdedDocId: budget.holdedDocId,
    holdedSyncedAt: budget.holdedSyncedAt,
  });
}
