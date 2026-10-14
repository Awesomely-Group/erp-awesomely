"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AuditAction } from "@prisma/client";
import { revalidatePath } from "next/cache";
import {
  canManageSsoAllowlist,
  normalizeEmail,
} from "@/lib/sso-allowlist";
import { requireAdmin, requireSession } from "@/lib/roles";
import {
  DEFAULT_GRANT_DAYS,
  MAX_GRANT_DAYS,
  grantScopeError,
  isApiScope,
} from "@/lib/api-scopes";
import {
  grantApiAccess,
  mintApiKey,
  revokeApiAccess,
  revokeApiKey,
} from "@/lib/api-keys";

export async function createCompany(data: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const name = data.get("name") as string;
  const holdedApiKey = data.get("holdedApiKey") as string;

  const company = await prisma.company.create({
    data: {
      name,
      holdedApiKey,
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

export async function updateCompany(id: string, data: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const holdedApiKey = data.get("holdedApiKey") as string;
  if (!holdedApiKey) return;

  await prisma.company.update({ where: { id }, data: { holdedApiKey } });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: AuditAction.UPDATE,
      entityType: "Company",
      entityId: id,
      newValue: { holdedApiKey: "updated" },
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
  const tempoApiToken = (data.get("tempoApiToken") as string) || undefined;
  const giroOrgSlug = (data.get("giroOrgSlug") as string) || undefined;
  const giroApiKey = (data.get("giroApiKey") as string) || undefined;

  const workspace = await prisma.jiraWorkspace.create({
    data: { name, domain, email, apiToken, tempoApiToken, giroOrgSlug, giroApiKey },
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
  const tempoApiToken = data.get("tempoApiToken") as string;
  const giroOrgSlug = data.get("giroOrgSlug") as string;
  const giroApiKey = data.get("giroApiKey") as string;

  const update: {
    domain: string;
    email: string;
    giroOrgSlug: string | null;
    apiToken?: string;
    tempoApiToken?: string;
    giroApiKey?: string;
  } = { domain, email, giroOrgSlug: giroOrgSlug || null };
  if (apiToken) update.apiToken = apiToken;
  if (tempoApiToken) update.tempoApiToken = tempoApiToken;
  // giroOrgSlug sí se guarda vacío (permite desvincular, no es un secreto); giroApiKey
  // solo se sobrescribe si se rellena, mismo criterio que apiToken/tempoApiToken — no
  // tiene sentido borrar un secreto sin querer al dejar el campo en blanco.
  if (giroApiKey) update.giroApiKey = giroApiKey;

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

// ─── Account Mappings ─────────────────────────────────────────────────────────

interface AccountMappingData {
  tag: string;
  description: string;
  l1: string;
  accountNumSL?: string | null;
  accountNameSL?: string | null;
  accountNumOU?: string | null;
  accountNameOU?: string | null;
}

export async function createAccountMapping(data: AccountMappingData): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.accountMapping.upsert({
    where: { tag: data.tag },
    update: {
      description: data.description,
      l1: data.l1,
      accountNumSL: data.accountNumSL ?? null,
      accountNameSL: data.accountNameSL ?? null,
      accountNumOU: data.accountNumOU ?? null,
      accountNameOU: data.accountNameOU ?? null,
    },
    create: {
      tag: data.tag,
      description: data.description,
      l1: data.l1,
      accountNumSL: data.accountNumSL ?? null,
      accountNameSL: data.accountNameSL ?? null,
      accountNumOU: data.accountNumOU ?? null,
      accountNameOU: data.accountNameOU ?? null,
    },
  });

  revalidatePath("/settings");
}

export async function updateAccountMapping(id: string, data: AccountMappingData): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.accountMapping.update({
    where: { id },
    data: {
      tag: data.tag,
      description: data.description,
      l1: data.l1,
      accountNumSL: data.accountNumSL ?? null,
      accountNameSL: data.accountNameSL ?? null,
      accountNumOU: data.accountNumOU ?? null,
      accountNameOU: data.accountNameOU ?? null,
    },
  });

  revalidatePath("/settings");
}

export async function deleteAccountMapping(id: string): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.accountMapping.delete({ where: { id } });

  revalidatePath("/settings");
}

// ─── Acceso por API ───────────────────────────────────────────────────────────
//
// Dos actos distintos, dos acciones distintas: un ADMIN **concede** acceso a una
// persona, y es esa persona quien **acuña** sus claves. Si el ADMIN las creara, el valor
// en claro pasaría por sus manos y viajaría por Slack o por correo, y una credencial que
// ha estado en un chat ya no es una credencial.

export type ApiKeyFormState = { error?: string; newKey?: string } | undefined;
export type GrantFormState = { error?: string; ok?: true } | undefined;

/** Concede o renueva el acceso de una persona. Solo ADMIN. */
export async function grantAccess(
  _prev: GrantFormState,
  formData: FormData,
): Promise<GrantFormState> {
  const session = await requireAdmin();

  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "Elige a quién se lo concedes" };

  const scopes = formData.getAll("scopes").map(String);
  const companyIds = formData.getAll("companyIds").map(String).filter(Boolean);
  const marcas = formData.getAll("marcas").map(String).filter(Boolean);

  const dias = Number(formData.get("days") ?? DEFAULT_GRANT_DAYS);
  if (!Number.isInteger(dias) || dias < 1 || dias > MAX_GRANT_DAYS) {
    return { error: `La caducidad tiene que estar entre 1 y ${MAX_GRANT_DAYS} días` };
  }

  const nota = String(formData.get("note") ?? "").trim();
  if (nota.length > 200) return { error: "La nota es demasiado larga" };

  // El rol se lee de la base, nunca del formulario: es el que decide qué se puede
  // conceder, y venir del cliente lo convertiría en una sugerencia.
  const destinatario = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!destinatario) return { error: "Esa persona no existe" };

  const problema = grantScopeError(scopes, destinatario.role);
  if (problema) return { error: problema };

  await grantApiAccess({
    userId,
    scopes: scopes.filter(isApiScope),
    companyIds,
    marcas,
    days: dias,
    note: nota || null,
    grantedById: session.user.id,
  });

  revalidatePath("/settings");
  return { ok: true };
}

/** Retira el acceso y, en cascada, las claves que colgaban de él. Solo ADMIN. */
export async function revokeAccess(_prev: GrantFormState, formData: FormData): Promise<GrantFormState> {
  const session = await requireAdmin();

  const grantId = String(formData.get("grantId") ?? "");
  if (!grantId) return { error: "Falta la concesión" };

  const resultado = await revokeApiAccess(grantId, session.user.id);
  if (!resultado) return { error: "Esa concesión ya estaba retirada" };

  revalidatePath("/settings");
  return { ok: true };
}

/**
 * Acuña una clave propia, dentro de la concesión viva de quien la pide. El valor en
 * claro vuelve por aquí y se enseña **una vez**: no se guarda en ningún sitio del que se
 * pueda recuperar.
 */
export async function createApiKey(
  _prev: ApiKeyFormState,
  formData: FormData,
): Promise<ApiKeyFormState> {
  const session = await requireSession();

  const resultado = await mintApiKey({
    userId: session.user.id,
    name: String(formData.get("name") ?? ""),
    scopes: formData.getAll("scopes").map(String),
    companyIds: formData.getAll("companyIds").map(String).filter(Boolean),
    marcas: formData.getAll("marcas").map(String).filter(Boolean),
  });

  if (!resultado.ok) return { error: resultado.error };

  revalidatePath("/settings");
  return { newKey: resultado.plain };
}

/**
 * Revoca una clave. Un ADMIN puede retirar cualquiera; el resto, solo las suyas. Nadie
 * puede **leer** ninguna: el valor en claro no existe fuera del momento del alta.
 */
export async function deleteApiKey(
  _prev: ApiKeyFormState,
  formData: FormData,
): Promise<ApiKeyFormState> {
  const session = await requireSession();

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Falta id" };

  const esAdmin = session.user.role === "ADMIN";
  const revocada = await revokeApiKey(id, session.user.id, esAdmin ? undefined : session.user.id);
  if (!revocada) return { error: "Esa clave no existe o ya estaba revocada" };

  revalidatePath("/settings");
  return undefined;
}
