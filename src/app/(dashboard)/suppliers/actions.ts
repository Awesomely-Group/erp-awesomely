"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { type SupplierTipo } from "@prisma/client";

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

export async function updateJiraAccountId(
  supplierId: string,
  jiraAccountId: string | null,
): Promise<void> {
  await prisma.supplier.update({
    where: { id: supplierId },
    data: { jiraAccountId },
  });
  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/${supplierId}`);
}

export async function updateSupplierTipo(
  supplierId: string,
  tipo: SupplierTipo | "",
): Promise<void> {
  await prisma.supplier.update({
    where: { id: supplierId },
    data: { tipo: tipo !== "" ? tipo : null },
  });
  revalidatePath("/suppliers");
}

export async function setDefaultRole(
  supplierId: string,
  roleId: string | null,
): Promise<void> {
  await prisma.supplier.update({
    where: { id: supplierId },
    data: { defaultRoleId: roleId },
  });
  revalidatePath(`/suppliers/${supplierId}`);
}

