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
}

interface HourBucketPayload {
  id?: string;
  roleId: string;
  totalHours: number;
  alertThreshold: number;
  startDate?: string | null;
  endDate?: string | null;
}

interface RegularFeeEntryPayload {
  id?: string;
  label: string;
  monthlyFee: number;
  maxHoursPerMonth: number;
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

  const dates = {
    startDate: bucket.startDate ? new Date(bucket.startDate) : null,
    endDate: bucket.endDate ? new Date(bucket.endDate) : null,
  };

  if (bucket.id) {
    await prisma.hourBucket.update({
      where: { id: bucket.id },
      data: {
        roleId: bucket.roleId,
        totalHours: bucket.totalHours,
        alertThreshold: bucket.alertThreshold,
        ...dates,
      },
    });
  } else {
    await prisma.hourBucket.create({
      data: {
        projectId,
        roleId: bucket.roleId,
        totalHours: bucket.totalHours,
        alertThreshold: bucket.alertThreshold,
        ...dates,
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

export async function toggleHourBucketActive(bucketId: string, projectId: string, active: boolean): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.hourBucket.update({ where: { id: bucketId }, data: { active } });
  revalidatePath(`/projects/${projectId}`);
}

export async function upsertRegularFeeEntry(
  projectId: string,
  entry: RegularFeeEntryPayload
): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  if (entry.id) {
    await prisma.regularFeeEntry.update({
      where: { id: entry.id },
      data: { label: entry.label, monthlyFee: entry.monthlyFee, maxHoursPerMonth: entry.maxHoursPerMonth },
    });
  } else {
    await prisma.regularFeeEntry.create({
      data: { projectId, label: entry.label, monthlyFee: entry.monthlyFee, maxHoursPerMonth: entry.maxHoursPerMonth },
    });
  }
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteRegularFeeEntry(entryId: string, projectId: string): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.regularFeeEntry.delete({ where: { id: entryId } });
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
