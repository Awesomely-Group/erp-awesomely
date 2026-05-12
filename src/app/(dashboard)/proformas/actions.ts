"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function classifyProforma(
  proformaId: string,
  data: { marca: string | null; projectId: string | null; notes: string | null }
): Promise<void> {
  await prisma.proforma.update({
    where: { id: proformaId },
    data: {
      marca: data.marca ?? null,
      projectId: data.projectId ?? null,
      notes: data.notes ?? null,
    },
  });
  revalidatePath("/proformas");
}
