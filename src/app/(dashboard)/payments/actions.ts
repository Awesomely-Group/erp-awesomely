"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function registerPayment({
  invoiceId,
  amount,
  paidAt,
  notes,
}: {
  invoiceId: string;
  amount: number;
  paidAt: string; // ISO date string
  notes: string;
}): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.invoicePayment.create({
    data: {
      invoiceId,
      amount,
      paidAt: new Date(paidAt),
      paidBy: session.user.email ?? session.user.id ?? "unknown",
      notes: notes || null,
    },
  });

  revalidatePath("/payments");
}
