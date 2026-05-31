"use server";

import { prisma } from "@/lib/prisma";
import { ProjectStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";

async function generateBucketCode(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `B${String(year).slice(-2)}`;
  const existing = await prisma.hourBucket.findMany({
    where: { code: { startsWith: prefix } },
    select: { code: true },
  });
  let maxNum = 0;
  for (const b of existing) {
    if (!b.code) continue;
    const num = parseInt(b.code.slice(3), 10);
    if (!isNaN(num) && num > maxNum) maxNum = num;
  }
  return `${prefix}${String(maxNum + 1).padStart(4, "0")}`;
}
interface ProjectTypesPayload {
  isPrecioCerrado: boolean;
  isBolsasHoras: boolean;
  isFeeRegular: boolean;
  fixedPrice?: number | null;
  budgetedHours?: number | null;
  fixedPriceInvoiceId?: string | null;
}

interface HourBucketPayload {
  id?: string;
  roleId: string;
  totalHours: number;
  alertThreshold: number;
  startDate?: string | null;
  endDate?: string | null;
  invoiceId?: string | null;
}

interface RegularFeeEntryPayload {
  id?: string;
  label: string;
  monthlyFee: number;
  maxHoursPerMonth: number;
  roleId?: string | null;
  invoiceId?: string | null;
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
      fixedPriceInvoiceId: payload.isPrecioCerrado ? (payload.fixedPriceInvoiceId ?? null) : null,
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
        invoiceId: bucket.invoiceId ?? null,
        ...dates,
      },
    });
  } else {
    const code = await generateBucketCode();
    await prisma.hourBucket.create({
      data: {
        projectId,
        roleId: bucket.roleId,
        totalHours: bucket.totalHours,
        alertThreshold: bucket.alertThreshold,
        code,
        invoiceId: bucket.invoiceId ?? null,
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
      data: { label: entry.label, monthlyFee: entry.monthlyFee, maxHoursPerMonth: entry.maxHoursPerMonth, roleId: entry.roleId ?? null, invoiceId: entry.invoiceId ?? null },
    });
  } else {
    await prisma.regularFeeEntry.create({
      data: { projectId, label: entry.label, monthlyFee: entry.monthlyFee, maxHoursPerMonth: entry.maxHoursPerMonth, roleId: entry.roleId ?? null, invoiceId: entry.invoiceId ?? null },
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
  ratePerHour?: number | null,
): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  if (roleId === null) {
    await prisma.projectUserRole.deleteMany({ where: { projectId, jiraAccountId } });
  } else {
    const rateValue = ratePerHour !== undefined ? ratePerHour : null;
    await prisma.projectUserRole.upsert({
      where: { projectId_jiraAccountId: { projectId, jiraAccountId } },
      create: { projectId, jiraAccountId, roleId, ratePerHour: rateValue },
      update: { roleId, ratePerHour: rateValue },
    });
  }
}

export async function assignIssueToBucket(
  projectId: string,
  issueKey: string,
  issueNumericId: number,
  hourBucketId: string | null,
): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  if (hourBucketId === null) {
    await prisma.issueHourBucketAssignment.deleteMany({ where: { projectId, issueKey } });
  } else {
    const bucket = await prisma.hourBucket.findFirst({ where: { id: hourBucketId, projectId } });
    if (!bucket) throw new Error("Bucket not found");

    await prisma.issueHourBucketAssignment.upsert({
      where: { projectId_issueKey: { projectId, issueKey } },
      create: { projectId, issueKey, issueNumericId, hourBucketId },
      update: { hourBucketId, issueNumericId },
    });
  }
  revalidatePath(`/projects/${projectId}/timesheet`);
}
