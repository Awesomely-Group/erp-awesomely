"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AuditAction } from "@prisma/client";
import { revalidatePath } from "next/cache";
import {
  canManageSsoAllowlist,
  normalizeEmail,
} from "@/lib/sso-allowlist";
import { parseEmpresaParam, parseMarcaParam } from "@/lib/org";

export async function createCompany(data: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const name = data.get("name") as string;
  const holdedApiKey = data.get("holdedApiKey") as string;
  const empresaStr = ((data.get("empresa") as string) || "").trim();
  const marcaStr = ((data.get("marca") as string) || "").trim();
  const empresa = empresaStr ? parseEmpresaParam(empresaStr) ?? null : null;
  const marca = marcaStr ? parseMarcaParam(marcaStr) ?? null : null;

  const company = await prisma.company.create({
    data: {
      name,
      holdedApiKey,
      empresa,
      marca,
    },
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
  revalidatePath("/invoices");
}

export async function updateCompanyOrg(
  companyId: string,
  raw: { empresa: string | null; marca: string | null }
): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const empresa = raw.empresa
    ? parseEmpresaParam(raw.empresa) ?? null
    : null;
  const marca = raw.marca ? parseMarcaParam(raw.marca) ?? null : null;

  await prisma.company.update({
    where: { id: companyId },
    data: { empresa, marca },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: AuditAction.UPDATE,
      entityType: "Company",
      entityId: companyId,
      newValue: { empresa, marca },
    },
  });

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/invoices");
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
