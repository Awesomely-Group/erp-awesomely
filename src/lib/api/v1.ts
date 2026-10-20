/**
 * Fontanería de `/api/v1`: autenticación por API key, errores, paginación y la
 * frontera de datos.
 *
 * Tres reglas que gobiernan todas las rutas de debajo:
 *
 * 1. **La clave declara su scope en cada ruta**, no se asume. Sin él no compila, así
 *    que una ruta nueva no puede colarse heredando el permiso de otra por olvido.
 * 2. **El alcance a sociedades y marcas no es un parámetro.** Sale de la credencial y
 *    se inyecta en el `where`; si llegara del cliente, cualquiera podría ampliarlo.
 * 3. **Los rechazos de identidad son indistinguibles entre sí.** Clave inexistente,
 *    revocada, caducada, concesión muerta o persona fuera de la allowlist responden el
 *    mismo 401: cualquier matiz es información para quien prueba claves a ciegas. Solo
 *    la falta de permiso responde 403, porque ahí la identidad ya está probada.
 */
import type { Prisma, UserRole } from "@prisma/client";
import { resolveApiIdentity } from "@/lib/api-keys";
import type { ApiScope } from "@/lib/api-scopes";

export type ApiContext = {
  keyId: string;
  userId: string;
  role: UserRole;
  scopes: ApiScope[];
  /** Vacío = sin restricción. Nunca se rellena con lo que diga el cliente. */
  companyIds: string[];
  marcas: string[];
};

function bearer(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const [scheme, ...rest] = header.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== "bearer") return null;
  return rest.join("") || null;
}

export type ApiErrorCode =
  | "unauthorized"
  | "forbidden_scope"
  | "bad_request"
  | "not_found"
  | "conflict"
  | "unprocessable";

/**
 * Cuerpo de error uniforme. El `code` existe para que un cliente pueda ramificar sin
 * leer el texto, que está en español y puede cambiar.
 */
export function apiError(status: number, code: ApiErrorCode, message: string, extra?: Record<string, unknown>): Response {
  return Response.json({ error: { code, message, ...(extra ?? {}) } }, { status });
}

export function apiOk<T>(data: T): Response {
  return Response.json({ data });
}

// ─── Paginación ───────────────────────────────────────────────────────────────

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export type Page = { limit: number; offset: number };

/**
 * `?limit`/`?offset`, con tope duro. Sin tope, una consulta sin acotar se lleva el
 * histórico entero de facturas por un descuido.
 */
export function page(url: URL): Page | Response {
  const limitRaw = url.searchParams.get("limit");
  const offsetRaw = url.searchParams.get("offset");

  const limit = limitRaw === null ? DEFAULT_LIMIT : Number(limitRaw);
  const offset = offsetRaw === null ? 0 : Number(offsetRaw);

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    return apiError(400, "bad_request", `\`limit\` tiene que estar entre 1 y ${MAX_LIMIT}`);
  }
  if (!Number.isInteger(offset) || offset < 0) {
    return apiError(400, "bad_request", "`offset` no puede ser negativo");
  }
  return { limit, offset };
}

export function paged<T>(items: T[], total: number, p: Page): Response {
  return Response.json({
    data: items,
    page: { limit: p.limit, offset: p.offset, total, hasMore: p.offset + items.length < total },
  });
}

/** `?from`/`?to` en `YYYY-MM-DD`, opcionales salvo que la ruta diga lo contrario. */
export function dateParam(url: URL, name: string): Date | null | Response {
  const raw = url.searchParams.get(name);
  if (raw === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return apiError(400, "bad_request", `\`${name}\` tiene que ser YYYY-MM-DD`);
  }
  return new Date(`${raw}T00:00:00.000Z`);
}

// ─── Frontera de datos ────────────────────────────────────────────────────────

/**
 * Filtro de sociedad que hay que meter en **todo** `where` de un modelo con
 * `companyId`. Devuelve `{}` solo cuando la credencial no está acotada.
 */
export function companyWhere(ctx: ApiContext): { companyId?: { in: string[] } } {
  return ctx.companyIds.length === 0 ? {} : { companyId: { in: ctx.companyIds } };
}

/** Lo mismo para `marca`, que es la frontera entre negocios dentro de una sociedad. */
export function marcaWhere(ctx: ApiContext): { marca?: { in: string[] } } {
  return ctx.marcas.length === 0 ? {} : { marca: { in: ctx.marcas } };
}

/**
 * Acota un `companyId` pedido por el cliente a lo que la credencial permite. Un id
 * fuera de alcance no responde 403: responde "no hay nada", igual que si no existiera.
 * Distinguirlos diría qué sociedades existen a quien no debería saberlo.
 */
export function narrowCompanyFilter(ctx: ApiContext, requested: string | null): Prisma.StringFilter | string | undefined {
  if (requested === null) return ctx.companyIds.length === 0 ? undefined : { in: ctx.companyIds };
  if (ctx.companyIds.length === 0) return requested;
  return ctx.companyIds.includes(requested) ? requested : { in: [] };
}

// ─── El guard ─────────────────────────────────────────────────────────────────

/**
 * Resuelve la credencial y comprueba el permiso, o devuelve la respuesta de rechazo.
 *
 * Separada de `apiRoute` porque el MCP usa esta misma cadena: una sola puerta, una sola
 * cerradura. Ahí se llama **sin scope**, porque el recorte es qué herramientas se ven.
 */
export async function resolveApiContext(
  request: Request,
  options: { scope?: ApiScope } = {},
): Promise<ApiContext | Response> {
  const plain = bearer(request);
  if (!plain) return apiError(401, "unauthorized", "Falta la API key");

  const identidad = await resolveApiIdentity(plain);
  if (!identidad) return apiError(401, "unauthorized", "API key no válida");

  if (options.scope && !identidad.scopes.includes(options.scope)) {
    return apiError(403, "forbidden_scope", `La clave no tiene permiso para esto (${options.scope})`, {
      scope: options.scope,
    });
  }

  return identidad;
}

export function apiRoute<Route = unknown>(
  handler: (request: Request, context: ApiContext, route: Route) => Promise<Response>,
  options: { scope: ApiScope },
): (request: Request, route?: Route) => Promise<Response> {
  return async (request, route) => {
    const context = await resolveApiContext(request, options);
    if (context instanceof Response) return context;
    return handler(request, context, route as Route);
  };
}
