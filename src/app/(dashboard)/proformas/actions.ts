"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function classifyProforma(
  proformaId: string,
  data: { marca?: string | null; projectId?: string | null; notes?: string | null }
): Promise<void> {
  await prisma.proforma.update({
    where: { id: proformaId },
    data: {
      ...(data.marca !== undefined && { marca: data.marca }),
      ...(data.projectId !== undefined && { projectId: data.projectId }),
      ...(data.notes !== undefined && { notes: data.notes }),
    },
  });
  revalidatePath("/proformas");
}

/**
 * Manually link (or unlink) a proforma to the invoice it was converted into.
 * Used when the automatic detection (Holded's native `from` relation, or the legacy
 * amount/date heuristic as fallback) couldn't resolve it — or to correct a wrong link.
 * A manual link is never overwritten by a later sync (see the invoiceLinkedManually guard
 * in syncProformas/markConvertedProformas/linkProformasByHoldedRelation in src/lib/sync.ts).
 */
export async function linkProformaToInvoice(
  proformaId: string,
  invoiceId: string | null
): Promise<void> {
  await prisma.proforma.update({
    where: { id: proformaId },
    data: {
      invoiceId,
      invoiceLinkedManually: invoiceId !== null,
      invoiceLinkConfidence: invoiceId !== null ? "manual" : null,
      // On link, mark as converted immediately. On unlink, leave holdedStatus untouched —
      // the next sync (or another manual action) will resolve the correct status; guessing
      // here would be more surprising than leaving it as-is.
      ...(invoiceId !== null ? { holdedStatus: 3 } : {}),
    },
  });
  revalidatePath("/proformas");
}
