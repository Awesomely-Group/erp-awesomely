/**
 * Catálogo de permisos de la API del ERP y las reglas que los recortan.
 *
 * Módulo **puro**: no importa Prisma ni `auth()`, así que se puede probar sin base de
 * datos (mismo criterio que `portal-auth.ts`). Las operaciones que tocan la BD viven en
 * `api-keys.ts`.
 *
 * La regla que lo sostiene todo, igual que en Giro:
 *
 *     efectivo = clave ∩ concesión ∩ permisos vivos del dueño
 *
 * recalculada **en cada petición**, nunca leída de la fila de la clave. La consecuencia
 * buscada es que una clave no pueda nunca más que su dueño hoy: bajar a alguien de ADMIN
 * o sacarle de la allowlist de SSO le corta el acceso en la petición siguiente, sin que
 * nadie tenga que acordarse de ir a cazar credenciales.
 */
import type { UserRole } from "@prisma/client";

export const API_SCOPES = [
  "projects:read",
  "invoices:read",
  "suppliers:read",
  "budgets:read",
  "finance:read",
  "cash:read",
  "payroll:read",
  "crm:read",
  "ops:read",
  "invoices:classify",
  "projects:write",
  "budgets:write",
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

export function isApiScope(value: string): value is ApiScope {
  return (API_SCOPES as readonly string[]).includes(value);
}

/**
 * Qué significa cada permiso, para la pantalla de concesiones. El texto importa: es lo
 * único que lee quien concede antes de marcar una casilla.
 */
export const API_SCOPE_META: Record<ApiScope, { label: string; hint: string }> = {
  "projects:read": {
    label: "Proyectos",
    hint: "Listado de proyectos con su estado, modelo de pricing y bolsas de horas.",
  },
  "invoices:read": {
    label: "Facturas",
    hint: "Facturas de venta y compra, sus líneas, su clasificación y sus proformas.",
  },
  "suppliers:read": {
    label: "Proveedores",
    hint: "Proveedores, sus tarifas y sus verificaciones de horas.",
  },
  "budgets:read": { label: "Presupuestos", hint: "Presupuestos, sus líneas y sus condiciones de pago." },
  "finance:read": {
    label: "Finanzas (agregados)",
    hint: "KPIs, P&L, flujo de caja, previsiones y conciliación de horas. Cifras agregadas.",
  },
  "cash:read": {
    label: "Tesorería",
    hint: "Saldo de caja y pagos individuales por sociedad. Solo administradores: es el dato que busca un fraude del CEO.",
  },
  "payroll:read": {
    label: "Nóminas",
    hint: "Personas empleadas y sus nóminas, incluido el IBAN. Solo administradores, y nunca se expone al MCP.",
  },
  "crm:read": { label: "CRM", hint: "Leads, cuentas, oportunidades y comisiones." },
  "ops:read": { label: "Operación", hint: "Historial de sincronizaciones y estado de las integraciones." },
  "invoices:classify": {
    label: "Clasificar facturas",
    hint: "Asignar una factura a proyecto o marca. Reversible desde la pantalla.",
  },
  "projects:write": { label: "Cambiar estado de proyecto", hint: "Mover un proyecto entre estados. No crea ni borra." },
  "budgets:write": {
    label: "Presupuestos en borrador",
    hint: "Crear o editar presupuestos en BORRADOR. Nunca aprobarlos, enviarlos ni firmarlos.",
  },
};

/**
 * Permisos que exigen ADMIN **vivo**, no solo estar en la concesión.
 *
 * Los tres se separan por **sensibilidad, no por tabla**: las nóminas llevan IBAN de
 * personas físicas, la tesorería es el saldo y los pagos (distinto de los agregados que
 * ya circulan en informes), y los presupuestos escriben un documento que acaba delante
 * de un cliente.
 */
const ADMIN_ONLY_SCOPES: readonly ApiScope[] = ["payroll:read", "cash:read", "budgets:write"];

/**
 * Lo único que un COMERCIAL ve por pantalla es `/crm` y `/campanas` (`src/proxy.ts`), así
 * que es lo único que puede ejercer por API. Una clave suya con `invoices:read` sería una
 * puerta a datos que su propia sesión no abre.
 */
const COMERCIAL_SCOPES: readonly ApiScope[] = ["crm:read"];

/** Lo máximo que puede ejercer alguien con este rol, hoy. */
export function scopesForRole(role: UserRole): ApiScope[] {
  if (role === "COMERCIAL") return [...COMERCIAL_SCOPES];
  return API_SCOPES.filter((scope) => role === "ADMIN" || !ADMIN_ONLY_SCOPES.includes(scope));
}

/**
 * La intersección de las tres fuentes. El orden de `API_SCOPES` se respeta para que dos
 * llamadas devuelvan arrays comparables.
 */
export function effectiveScopes(input: {
  keyScopes: string[];
  grantScopes: string[];
  role: UserRole;
}): ApiScope[] {
  const delRol = new Set(scopesForRole(input.role));
  const deLaClave = new Set(input.keyScopes);
  const deLaConcesion = new Set(input.grantScopes);
  return API_SCOPES.filter(
    (scope) => delRol.has(scope) && deLaClave.has(scope) && deLaConcesion.has(scope),
  );
}

/**
 * Valida un alta de concesión. Conceder a alguien algo que su rol no puede ejercer no
 * sería peligroso —la intersección lo dejaría inerte— pero sí **engañoso**: la pantalla
 * diría que puede y la API diría que no.
 */
export function grantScopeError(scopes: string[], targetRole: UserRole): string | null {
  if (scopes.length === 0) return "Marca al menos un permiso";

  const desconocido = scopes.find((scope) => !isApiScope(scope));
  if (desconocido) return `"${desconocido}" no es un permiso válido`;

  const permitidos = new Set(scopesForRole(targetRole));
  const fuera = scopes.filter((scope): scope is ApiScope => isApiScope(scope) && !permitidos.has(scope));
  if (fuera.length > 0) {
    const etiquetas = fuera.map((scope) => API_SCOPE_META[scope].label).join(", ");
    return targetRole === "COMERCIAL"
      ? `Un perfil comercial no puede ejercer: ${etiquetas}`
      : `Estos permisos piden rol de administrador: ${etiquetas}`;
  }
  return null;
}

/**
 * Frontera de datos: la de la clave acotada por la de la concesión.
 *
 * Vacío significa "sin restricción", así que la intersección no es la de conjuntos: si
 * la concesión acota y la clave no, manda la concesión. Y una clave **nunca** puede
 * ampliar lo que la concesión permitió.
 */
export function narrowIds(keyIds: string[], grantIds: string[]): string[] {
  if (grantIds.length === 0) return keyIds;
  if (keyIds.length === 0) return grantIds;
  return keyIds.filter((id) => grantIds.includes(id));
}

/** Por defecto 90 días. Que caduque molesta, y por eso funciona. */
export const DEFAULT_GRANT_DAYS = 90;
export const MAX_GRANT_DAYS = 366;

export function grantExpiry(days: number = DEFAULT_GRANT_DAYS, from: Date = new Date()): Date {
  const expira = new Date(from);
  expira.setUTCDate(expira.getUTCDate() + days);
  return expira;
}

export type GrantLiveness = { revokedAt: Date | null; expiresAt: Date };

export function isGrantLive(grant: GrantLiveness | null, now: Date = new Date()): boolean {
  if (!grant) return false;
  if (grant.revokedAt) return false;
  return grant.expiresAt > now;
}
