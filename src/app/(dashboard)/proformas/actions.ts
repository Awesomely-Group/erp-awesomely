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
