"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { type SupplierTipo } from "@prisma/client";

export async function updateSupplierData(
  supplierId: string,
  hourlyRate: string,
): Promise<void> {
  await prisma.supplier.update({
    where: { id: supplierId },
    data: {
      hourlyRate: hourlyRate !== "" ? parseFloat(hourlyRate) : null,
    },
  });
  revalidatePath("/suppliers");
}

export async function addJiraUser(supplierId: string, accountId: string): Promise<void> {
  await prisma.supplierJiraUser.upsert({
    where: { supplierId_accountId: { supplierId, accountId } },
    create: { supplierId, accountId },
    update: {},
  });
  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/${supplierId}`);
}

export async function removeJiraUser(supplierId: string, accountId: string): Promise<void> {
  await prisma.supplierJiraUser.deleteMany({ where: { supplierId, accountId } });
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

export async function updateSupplierIsPartner(
  supplierId: string,
  isPartner: boolean,
): Promise<void> {
  await prisma.supplier.update({
    where: { id: supplierId },
    data: { isPartner },
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
  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/${supplierId}`);
}
