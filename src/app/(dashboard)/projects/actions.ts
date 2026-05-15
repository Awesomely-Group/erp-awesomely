"use server";

import { prisma } from "@/lib/prisma";
import { ProjectStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
interface ProjectTypesPayload {
  isPrecioCerrado: boolean;
  isBolsasHoras: boolean;
  isFeeRegular: boolean;
  fixedPrice?: number | null;
  budgetedHours?: number | null;
  monthlyFee?: number | null;
  maxHoursPerMonth?: number | null;
}

interface HourBucketPayload {
  id?: string;
  roleId: string;
  totalHours: number;
  alertThreshold: number;
}

export async function updateProjectStatus(
  projectId: string,
  status: ProjectStatus
): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  await prisma.jiraProject.update({ where: { id: projectId }, data: { status } });
  revalidatePath("/projects", "layout");
}

export async function updateProjectTypes(
  projectId: string,
  payload: ProjectTypesPayload
): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.jiraProject.update({
    where: { id: projectId },
    data: {
      isPrecioCerrado: payload.isPrecioCerrado,
      isBolsasHoras: payload.isBolsasHoras,
      isFeeRegular: payload.isFeeRegular,
      fixedPrice: payload.isPrecioCerrado ? (payload.fixedPrice ?? null) : null,
      budgetedHours: payload.isPrecioCerrado ? (payload.budgetedHours ?? null) : null,
      monthlyFee: payload.isFeeRegular ? (payload.monthlyFee ?? null) : null,
      maxHoursPerMonth: payload.isFeeRegular ? (payload.maxHoursPerMonth ?? null) : null,
    },
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function upsertHourBucket(
  projectId: string,
  bucket: HourBucketPayload
): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  if (bucket.id) {
    await prisma.hourBucket.update({
      where: { id: bucket.id },
      data: {
        roleId: bucket.roleId,
        totalHours: bucket.totalHours,
        alertThreshold: bucket.alertThreshold,
      },
    });
  } else {
    await prisma.hourBucket.create({
      data: {
        projectId,
        roleId: bucket.roleId,
        totalHours: bucket.totalHours,
        alertThreshold: bucket.alertThreshold,
      },
    });
  }
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteHourBucket(bucketId: string, projectId: string): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.hourBucket.delete({ where: { id: bucketId } });
  revalidatePath(`/projects/${projectId}`);
}

export async function setProjectUserRole(
  projectId: string,
  jiraAccountId: string,
  roleId: string | null,
): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  if (roleId === null) {
    await prisma.projectUserRole.deleteMany({ where: { projectId, jiraAccountId } });
  } else {
    await prisma.projectUserRole.upsert({
      where: { projectId_jiraAccountId: { projectId, jiraAccountId } },
      create: { projectId, jiraAccountId, roleId },
      update: { roleId },
    });
  }
}
