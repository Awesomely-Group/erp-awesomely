"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AuditAction } from "@prisma/client";
import { revalidatePath } from "next/cache";

export async function createCompany(data: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const name = data.get("name") as string;
  const holdedApiKey = data.get("holdedApiKey") as string;

  const company = await prisma.company.create({
    data: { name, holdedApiKey },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: AuditAction.CREATE,
      entityType: "Company",
      entityId: company.id,
      newValue: { name },
    },
  });

  revalidatePath("/settings");
}

export async function createWorkspace(data: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const name = data.get("name") as string;
  const rawDomain = data.get("domain") as string;
  const domain = rawDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const email = data.get("email") as string;
  const apiToken = data.get("apiToken") as string;

  const workspace = await prisma.jiraWorkspace.create({
    data: { name, domain, email, apiToken },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: AuditAction.CREATE,
      entityType: "JiraWorkspace",
      entityId: workspace.id,
      newValue: { name, domain, email },
    },
  });

  revalidatePath("/settings");
}

export async function updateWorkspace(id: string, data: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const rawDomain = data.get("domain") as string;
  const domain = rawDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const email = data.get("email") as string;
  const apiToken = data.get("apiToken") as string;

  const update: { domain: string; email: string; apiToken?: string } = { domain, email };
  if (apiToken) update.apiToken = apiToken;

  await prisma.jiraWorkspace.update({ where: { id }, data: update });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: AuditAction.UPDATE,
      entityType: "JiraWorkspace",
      entityId: id,
      newValue: { domain, email },
    },
  });

  revalidatePath("/settings");
}
