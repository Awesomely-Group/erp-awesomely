"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function updateSupplierData(
  supplierId: string,
  jiraAccountId: string,
  hourlyRate: string,
): Promise<void> {
  await prisma.supplier.update({
    where: { id: supplierId },
    data: {
      jiraAccountId: jiraAccountId.trim() !== "" ? jiraAccountId.trim() : null,
      hourlyRate: hourlyRate !== "" ? parseFloat(hourlyRate) : null,
    },
  });
  revalidatePath("/suppliers");
}
