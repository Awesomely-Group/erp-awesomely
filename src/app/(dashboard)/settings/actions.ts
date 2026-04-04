"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AuditAction } from "@prisma/client";
import { revalidatePath } from "next/cache";
import {
  canManageSsoAllowlist,
  normalizeEmail,
} from "@/lib/sso-allowlist";

export async function createCompany(data: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const name = data.get("name") as string;
  const holdedApiKey = data.get("holdedApiKey") as string;
  const legalEntityIdRaw = data.get("legalEntityId") as string | null;
  const legalEntityId =
    legalEntityIdRaw && legalEntityIdRaw.length > 0 ? legalEntityIdRaw : undefined;

  const company = await prisma.company.create({
    data: { name, holdedApiKey, legalEntityId },
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
  revalidatePath("/dashboard");
}

export async function createLegalEntity(data: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const name = (data.get("name") as string)?.trim();
  if (!name) throw new Error("Nombre requerido");

  const entity = await prisma.legalEntity.create({ data: { name } });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: AuditAction.CREATE,
      entityType: "LegalEntity",
      entityId: entity.id,
      newValue: { name },
    },
  });

  revalidatePath("/settings");
  revalidatePath("/dashboard");
}

export async function updateCompanyLegalEntity(
  companyId: string,
  legalEntityId: string | null
): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.company.update({
    where: { id: companyId },
    data: {
      legalEntityId: legalEntityId && legalEntityId.length > 0 ? legalEntityId : null,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: AuditAction.UPDATE,
      entityType: "Company",
      entityId: companyId,
      newValue: { legalEntityId: legalEntityId || null },
    },
  });

  revalidatePath("/settings");
  revalidatePath("/dashboard");
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SsoAllowlistFormState = { error?: string } | undefined;

export async function addSsoAllowedEmail(
  _prev: SsoAllowlistFormState,
  formData: FormData
): Promise<SsoAllowlistFormState> {
  const session = await auth();
  if (!session?.user?.email || !canManageSsoAllowlist(session.user.email)) {
    return { error: "No autorizado" };
  }

  const raw = formData.get("email") as string;
  const email = normalizeEmail(raw);
  if (!email || !EMAIL_RE.test(email)) {
    return { error: "Email no válido" };
  }

  await prisma.ssoAllowedEmail.upsert({
    where: { email },
    create: {
      email,
      createdByUserId: session.user.id,
    },
    update: {},
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: AuditAction.CREATE,
      entityType: "SsoAllowedEmail",
      entityId: email,
      newValue: { email },
    },
  });

  revalidatePath("/settings");
  return undefined;
}

export async function removeSsoAllowedEmail(
  _prev: SsoAllowlistFormState,
  formData: FormData
): Promise<SsoAllowlistFormState> {
  const session = await auth();
  if (!session?.user?.email || !canManageSsoAllowlist(session.user.email)) {
    return { error: "No autorizado" };
  }

  const id = formData.get("id") as string;
  if (!id) return { error: "Falta id" };

  const count = await prisma.ssoAllowedEmail.count();
  if (count <= 1) {
    return { error: "Debe quedar al menos un email autorizado para SSO" };
  }

  const row = await prisma.ssoAllowedEmail.findUnique({ where: { id } });
  if (!row) return { error: "No encontrado" };

  await prisma.ssoAllowedEmail.delete({ where: { id } });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: AuditAction.DELETE,
      entityType: "SsoAllowedEmail",
      entityId: row.email,
      previousValue: { email: row.email },
    },
  });

  revalidatePath("/settings");
  return undefined;
}
