/**
 * Concesiones de acceso y claves de API del ERP (lo que toca la base de datos).
 *
 * Las reglas puras —qué scopes existe, qué puede ejercer cada rol, la intersección—
 * viven en `api-scopes.ts`, sin Prisma, para poder probarlas sin base de datos.
 *
 * El acto de **conceder** y el de **acuñar** están separados a propósito, igual que en
 * Giro: un ADMIN autoriza a una persona, y es esa persona quien crea sus claves. Si el
 * ADMIN las creara, el valor en claro pasaría por sus manos y viajaría por Slack o por
 * correo, y una credencial que ha estado en un chat ya no es una credencial.
 */
import { createHash, randomBytes } from "node:crypto";
import { AuditAction, type UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  API_SCOPE_META,
  effectiveScopes,
  grantExpiry,
  isApiScope,
  isGrantLive,
  narrowIds,
  type ApiScope,
} from "@/lib/api-scopes";

/** Prefijo reconocible en un log, igual que el `giro_` de Giro. */
const PREFIX = "erp_";

/**
 * SHA-256 a secas, sin sal ni bcrypt, **a propósito**: es un secreto de 24 bytes
 * aleatorios (no una contraseña), no hay diccionario que probar, y el hash se calcula en
 * **cada** petición, donde bcrypt sería el cuello de botella.
 */
export function hashApiKey(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

// ─── Concesiones ──────────────────────────────────────────────────────────────

export type GrantRow = {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  userRole: UserRole;
  scopes: string[];
  companyIds: string[];
  marcas: string[];
  expiresAt: Date;
  revokedAt: Date | null;
  note: string | null;
  grantedByName: string | null;
  createdAt: Date;
  liveKeys: number;
};

export async function listGrants(): Promise<GrantRow[]> {
  const grants = await prisma.apiAccessGrant.findMany({
    include: {
      user: { select: { name: true, email: true, role: true } },
      grantedBy: { select: { name: true, email: true } },
      _count: { select: { keys: { where: { revokedAt: null } } } },
    },
    orderBy: [{ revokedAt: "asc" }, { createdAt: "desc" }],
  });

  return grants.map((grant) => ({
    id: grant.id,
    userId: grant.userId,
    userName: grant.user.name,
    userEmail: grant.user.email,
    userRole: grant.user.role,
    scopes: grant.scopes,
    companyIds: grant.companyIds,
    marcas: grant.marcas,
    expiresAt: grant.expiresAt,
    revokedAt: grant.revokedAt,
    note: grant.note,
    grantedByName: grant.grantedBy ? (grant.grantedBy.name ?? grant.grantedBy.email) : null,
    createdAt: grant.createdAt,
    liveKeys: grant._count.keys,
  }));
}

/** Personas a las que se puede conceder: las que pueden entrar (allowlist de SSO viva). */
export async function listGrantCandidates() {
  const permitidos = await prisma.ssoAllowedEmail.findMany({ select: { email: true } });
  const emails = permitidos.map((fila) => fila.email.toLowerCase());

  return prisma.user.findMany({
    where: { email: { in: emails, mode: "insensitive" } },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { email: "asc" },
  });
}

export async function grantFor(userId: string) {
  return prisma.apiAccessGrant.findUnique({ where: { userId } });
}

/**
 * Concede o renueva. Es un upsert por persona: renovar es editar la concesión, no
 * acumular una segunda, porque dos concesiones vivas serían dos techos distintos para la
 * misma persona y ninguna pantalla podría explicar cuál manda.
 */
export async function grantApiAccess(input: {
  userId: string;
  scopes: ApiScope[];
  companyIds: string[];
  marcas: string[];
  days: number;
  note: string | null;
  grantedById: string;
}): Promise<string> {
  const expiresAt = grantExpiry(input.days);
  const datos = {
    scopes: input.scopes,
    companyIds: input.companyIds,
    marcas: input.marcas,
    expiresAt,
    note: input.note,
    grantedById: input.grantedById,
    // Conceder a quien tenía una concesión retirada la revive: es el mismo acto.
    revokedAt: null,
    revokedById: null,
  };

  const grant = await prisma.apiAccessGrant.upsert({
    where: { userId: input.userId },
    create: { userId: input.userId, ...datos },
    update: datos,
  });

  await prisma.auditLog.create({
    data: {
      userId: input.grantedById,
      action: AuditAction.CREATE,
      entityType: "ApiAccessGrant",
      entityId: grant.id,
      newValue: {
        userId: input.userId,
        scopes: input.scopes,
        companyIds: input.companyIds,
        marcas: input.marcas,
        expiresAt: expiresAt.toISOString(),
      },
    },
  });

  return grant.id;
}

/**
 * Retirar una concesión **revoca en cascada sus claves**: si no, la persona perdería el
 * permiso de acuñar pero las credenciales ya repartidas seguirían vivas, que es
 * exactamente lo contrario de lo que quiere quien pulsa el botón.
 */
export async function revokeApiAccess(
  grantId: string,
  revokedById: string,
): Promise<{ revokedKeys: number } | null> {
  const ahora = new Date();

  const resultado = await prisma.$transaction(async (tx) => {
    const grant = await tx.apiAccessGrant.findUnique({ where: { id: grantId } });
    if (!grant || grant.revokedAt) return null;

    await tx.apiAccessGrant.update({
      where: { id: grantId },
      data: { revokedAt: ahora, revokedById },
    });

    const claves = await tx.apiKey.updateMany({
      where: { grantId, revokedAt: null },
      data: { revokedAt: ahora, revokedById },
    });

    return { revokedKeys: claves.count };
  });

  if (resultado) {
    await prisma.auditLog.create({
      data: {
        userId: revokedById,
        action: AuditAction.DELETE,
        entityType: "ApiAccessGrant",
        entityId: grantId,
        newValue: { revokedKeys: resultado.revokedKeys },
      },
    });
  }

  return resultado;
}

// ─── Claves ───────────────────────────────────────────────────────────────────

export type ApiKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  scopeLabels: string[];
  ownerName: string | null;
  ownerEmail: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
};

function toRow(key: {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
  user: { name: string | null; email: string };
}): ApiKeyRow {
  return {
    id: key.id,
    name: key.name,
    keyPrefix: key.keyPrefix,
    scopeLabels: key.scopes.map((scope) => (isApiScope(scope) ? API_SCOPE_META[scope].label : scope)),
    ownerName: key.user.name,
    ownerEmail: key.user.email,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt,
    expiresAt: key.expiresAt,
    revokedAt: key.revokedAt,
  };
}

const KEY_SELECT = {
  id: true,
  name: true,
  keyPrefix: true,
  scopes: true,
  createdAt: true,
  lastUsedAt: true,
  expiresAt: true,
  revokedAt: true,
  user: { select: { name: true, email: true } },
} as const;

/** Todas las de la instalación, para la pantalla de administración. */
export async function listApiKeys(): Promise<ApiKeyRow[]> {
  const keys = await prisma.apiKey.findMany({
    select: KEY_SELECT,
    orderBy: [{ revokedAt: "asc" }, { createdAt: "desc" }],
  });
  return keys.map(toRow);
}

/** Las de una persona, para su pantalla personal. */
export async function listOwnApiKeys(userId: string): Promise<ApiKeyRow[]> {
  const keys = await prisma.apiKey.findMany({
    where: { userId },
    select: KEY_SELECT,
    orderBy: [{ revokedAt: "asc" }, { createdAt: "desc" }],
  });
  return keys.map(toRow);
}

export type MintResult = { ok: true; plain: string } | { ok: false; error: string };

/**
 * Acuña una clave dentro de la concesión viva de su dueño.
 *
 * **No recorta en silencio**: pedir un scope que la concesión no da es un error, no un
 * ajuste. Recortar dejaría una clave que parece una cosa y hace otra, y quien la use se
 * enteraría con un 403 a mitad de una tarea.
 */
export async function mintApiKey(input: {
  userId: string;
  name: string;
  scopes: string[];
  companyIds: string[];
  marcas: string[];
}): Promise<MintResult> {
  const nombre = input.name.trim();
  if (!nombre) return { ok: false, error: "El nombre es obligatorio" };
  if (nombre.length > 64) return { ok: false, error: "El nombre no puede superar 64 caracteres" };

  const grant = await prisma.apiAccessGrant.findUnique({ where: { userId: input.userId } });
  if (!isGrantLive(grant)) {
    return { ok: false, error: "No tienes acceso por API concedido, o ha caducado" };
  }

  if (input.scopes.length === 0) return { ok: false, error: "Marca al menos un permiso" };

  const concedidos = new Set(grant!.scopes);
  const fuera = input.scopes.filter((scope) => !concedidos.has(scope));
  if (fuera.length > 0) {
    const etiquetas = fuera.map((scope) => (isApiScope(scope) ? API_SCOPE_META[scope].label : scope));
    return { ok: false, error: `Tu concesión no incluye: ${etiquetas.join(", ")}` };
  }

  const plain = PREFIX + randomBytes(24).toString("hex");

  const key = await prisma.apiKey.create({
    data: {
      name: nombre,
      keyHash: hashApiKey(plain),
      keyPrefix: plain.slice(0, 12),
      userId: input.userId,
      createdById: input.userId,
      grantId: grant!.id,
      scopes: input.scopes,
      companyIds: narrowIds(input.companyIds, grant!.companyIds),
      marcas: narrowIds(input.marcas, grant!.marcas),
      // La clave nunca sobrevive a su concesión.
      expiresAt: grant!.expiresAt,
    },
    select: { id: true, keyPrefix: true },
  });

  await prisma.auditLog.create({
    data: {
      userId: input.userId,
      action: AuditAction.CREATE,
      entityType: "ApiKey",
      entityId: key.id,
      newValue: { name: nombre, keyPrefix: key.keyPrefix, scopes: input.scopes },
    },
  });

  return { ok: true, plain };
}

/**
 * Revocar es marcar, no borrar: la fila con su `lastUsedAt` es lo que cuenta desde y
 * hasta cuándo estuvo viva una credencial. No se puede deshacer — una clave retirada por
 * filtración no debe poder volver.
 */
export async function revokeApiKey(keyId: string, revokedById: string, onlyOwner?: string): Promise<boolean> {
  const resultado = await prisma.apiKey.updateMany({
    where: { id: keyId, revokedAt: null, ...(onlyOwner ? { userId: onlyOwner } : {}) },
    data: { revokedAt: new Date(), revokedById },
  });
  if (resultado.count === 0) return false;

  await prisma.auditLog.create({
    data: {
      userId: revokedById,
      action: AuditAction.DELETE,
      entityType: "ApiKey",
      entityId: keyId,
    },
  });
  return true;
}

// ─── Resolución de una credencial ─────────────────────────────────────────────

export type ApiIdentity = {
  keyId: string;
  userId: string;
  role: UserRole;
  scopes: ApiScope[];
  companyIds: string[];
  marcas: string[];
};

/**
 * Lo que la clave puede hacer **ahora mismo**, o `null` si no puede nada.
 *
 * No distingue entre clave inexistente, revocada, caducada, concesión muerta o persona
 * fuera de la allowlist: cualquier matiz es información para quien prueba claves a
 * ciegas. Quien llama responde el mismo 401 en todos los casos.
 */
export async function resolveApiIdentity(plain: string, now: Date = new Date()): Promise<ApiIdentity | null> {
  const key = await prisma.apiKey.findUnique({
    where: { keyHash: hashApiKey(plain) },
    select: {
      id: true,
      userId: true,
      scopes: true,
      companyIds: true,
      marcas: true,
      expiresAt: true,
      revokedAt: true,
      user: { select: { email: true, role: true } },
      grant: {
        select: {
          userId: true,
          scopes: true,
          companyIds: true,
          marcas: true,
          expiresAt: true,
          revokedAt: true,
        },
      },
    },
  });

  if (!key || key.revokedAt || key.expiresAt <= now) return null;
  if (!isGrantLive(key.grant, now)) return null;
  // Defensivo: una clave cuya concesión es de otra persona es una fila incoherente.
  if (key.grant.userId !== key.userId) return null;

  // La pertenencia viva del ERP: quitar un email de la allowlist ya corta el login, así
  // que tiene que cortar también la clave. Se lee en cada petición, nunca se cachea.
  const permitido = await prisma.ssoAllowedEmail.findFirst({
    where: { email: { equals: key.user.email, mode: "insensitive" } },
    select: { id: true },
  });
  if (!permitido) return null;

  await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: now } });

  return {
    keyId: key.id,
    userId: key.userId,
    role: key.user.role,
    scopes: effectiveScopes({
      keyScopes: key.scopes,
      grantScopes: key.grant.scopes,
      role: key.user.role,
    }),
    companyIds: narrowIds(key.companyIds, key.grant.companyIds),
    marcas: narrowIds(key.marcas, key.grant.marcas),
  };
}
