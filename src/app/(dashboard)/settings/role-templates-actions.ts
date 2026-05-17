"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export async function createRoleTemplate(name: string, color: string, ratePerHour: number = 0): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("El nombre no puede estar vacío");
  await prisma.roleTemplate.create({ data: { name: trimmed, color, ratePerHour } });
  revalidatePath("/settings");
}

export async function updateRoleTemplate(id: string, name: string, color: string, ratePerHour: number = 0): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("El nombre no puede estar vacío");
  await prisma.roleTemplate.update({ where: { id }, data: { name: trimmed, color, ratePerHour } });
  revalidatePath("/settings");
}

export async function deleteRoleTemplate(id: string): Promise<void> {
  await prisma.roleTemplate.update({ where: { id }, data: { active: false } });
  revalidatePath("/settings");
}
