import { unauthorized, json } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { HoldedClient } from "@/lib/holded";
import { verifyWebhookSignature, type DocumensoWebhookPayload } from "@/lib/documenso";
import { BRAND_TO_MARCA, type ProposalBrand } from "@/lib/proposals-brand";
import type { BudgetLineType } from "@prisma/client";

function buildHoldedProducts(
  lines: Array<{
    lineType: BudgetLineType;
    phase: string | null;
    task: string | null;
    estimatedHours: number | null;
    pvpPerHour: unknown;
    concept: string | null;
    quantity: unknown;
    unitPrice: unknown;
  }>,
  fallbackName: string,
  fallbackAmount: unknown
): Array<{ name: string; units: number; price: number; subtotal: number }> {
  if (lines.length > 0) {
    return lines.map((l) => {
      if (l.lineType === "ACTIVIDAD") {
        const units = Number(l.quantity ?? 1);
        const price = Number(l.unitPrice ?? 0);
        return { name: l.concept ?? fallbackName, units, price, subtotal: units * price };
      }
      const units = l.estimatedHours ?? 0;
      const price = Number(l.pvpPerHour ?? 0);
      return { name: `${l.phase ?? ""} — ${l.task ?? ""}`, units, price, subtotal: units * price };
    });
  }
  const p = Number(fallbackAmount);
  return [{ name: fallbackName, units: 1, price: p, subtotal: p }];
}

/**
 * Webhook de Documenso: en `DOCUMENT_OPENED` marca la propuesta como vista; en
 * `DOCUMENT_COMPLETED` (todos los firmantes han firmado) crea la proforma real en Holded
 * y enlaza `PaymentTerm.proformaId` + clasifica `Proforma.marca`/`projectId`
 * automáticamente. Ver docs/proposals-plan-v2.md.
 *
 * Idempotente: si el Budget ya tiene `holdedDocId`, un reintento del webhook no vuelve a
 * crear la proforma.
 */
export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();
  const signature = req.headers.get("x-documenso-signature");
  if (!verifyWebhookSignature(rawBody, signature)) return unauthorized();

  let payload: DocumensoWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "Body JSON inválido" }, 400);
  }

  const documentId = payload.payload?.id ?? payload.payload?.documentId;
  if (documentId === undefined) return json({ ok: true, skipped: "sin documentId" });

  const budget = await prisma.budget.findFirst({
    where: { documensoDocumentId: documentId },
    include: {
      company: true,
      project: { select: { name: true } },
      lines: { orderBy: [{ phase: "asc" }, { sortOrder: "asc" }] },
      paymentTerms: true,
    },
  });
  if (!budget) return json({ ok: true, skipped: "budget no encontrado para este documento" });

  if (payload.event === "DOCUMENT_OPENED") {
    if (budget.documensoStatus !== "SIGNED") {
      await prisma.budget.update({ where: { id: budget.id }, data: { documensoStatus: "VIEWED" } });
    }
    return json({ ok: true });
  }

  if (payload.event !== "DOCUMENT_COMPLETED") {
    return json({ ok: true, skipped: `evento ${payload.event} sin acción` });
  }

  // Idempotencia: ya se creó la proforma en un webhook anterior.
  if (budget.holdedDocId) {
    return json({ ok: true, skipped: "ya procesado", holdedDocId: budget.holdedDocId });
  }
  if (!budget.company) return json({ ok: false, error: "El presupuesto no tiene empresa asignada" }, 500);

  const client = new HoldedClient(budget.company.holdedApiKey);

  let holdedResult: { id: string; docNumber?: string };
  try {
    holdedResult = await client.createDocument("proform", {
      date: Math.floor(Date.now() / 1000),
      ...(budget.holdedContactId
        ? { contactId: budget.holdedContactId }
        : { contactName: budget.clientName ?? budget.project.name }),
      currency: budget.currency,
      notes: budget.notes ?? undefined,
      products: buildHoldedProducts(budget.lines, budget.name, budget.amount),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al crear la proforma en Holded";
    return json({ ok: false, error: message }, 502);
  }

  const marca = BRAND_TO_MARCA[budget.template as ProposalBrand] ?? null;

  await prisma.$transaction(async (tx) => {
    const proforma = await tx.proforma.upsert({
      where: { holdedId_companyId: { holdedId: holdedResult.id, companyId: budget.companyId! } },
      create: {
        holdedId: holdedResult.id,
        companyId: budget.companyId!,
        number: holdedResult.docNumber ?? null,
        counterparty: budget.clientName ?? budget.project.name,
        holdedContactId: budget.holdedContactId,
        date: new Date(),
        currency: budget.currency,
        subtotal: budget.amount,
        total: budget.amount,
        totalEur: budget.amount,
        marca,
        projectId: budget.projectId,
      },
      update: { marca, projectId: budget.projectId },
    });

    await tx.paymentTerm.updateMany({
      where: { budgetId: budget.id },
      data: { proformaId: proforma.id },
    });

    await tx.budget.update({
      where: { id: budget.id },
      data: {
        holdedDocId: holdedResult.id,
        holdedSyncedAt: new Date(),
        documensoStatus: "SIGNED",
        status: "ACTIVE",
      },
    });
  });

  return json({ ok: true, holdedDocId: holdedResult.id });
}
