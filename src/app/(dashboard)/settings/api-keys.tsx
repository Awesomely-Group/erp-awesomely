import { grantFor, listApiKeys, listGrantCandidates, listGrants, listOwnApiKeys } from "@/lib/api-keys";
import { API_SCOPES, API_SCOPE_META, isGrantLive, scopesForRole, type ApiScope } from "@/lib/api-scopes";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/roles";
import { MARCA_OPTIONS } from "@/lib/org";
import { ApiGrantsClient } from "./api-grants-client";
import { ApiKeysClient } from "./api-keys-client";

/**
 * Acceso por API, en dos bloques porque son **dos actos distintos**:
 *
 * - *Conceder* (solo ADMIN): a quién se ha autorizado, con qué permisos y hasta cuándo.
 *   Aquí no se acuña ninguna clave, a propósito — quien concede autoriza, no reparte
 *   secretos.
 * - *Mis claves* (cualquiera): la persona autorizada crea las suyas dentro de sus
 *   permisos, y el valor en claro se le enseña una vez, a ella y a nadie más.
 *
 * Un ADMIN ve además todas las claves que existen, con su dueño, para poder retirarlas;
 * pero no puede leer ninguna.
 */
export async function ApiKeysSection(): Promise<React.JSX.Element> {
  const session = await requireSession();
  const esAdmin = session.user.role === "ADMIN";

  const [grant, misClaves, companies] = await Promise.all([
    grantFor(session.user.id),
    listOwnApiKeys(session.user.id),
    prisma.company.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const [concesiones, candidatos, todasLasClaves] = esAdmin
    ? await Promise.all([listGrants(), listGrantCandidates(), listApiKeys()])
    : [[], [], []];

  const viva = isGrantLive(grant);

  // Solo se ofrecen los permisos concedidos y, de esos, los que su rol pueda ejercer
  // hoy: marcar uno que la intersección va a tirar sería prometer algo falso.
  const ejercibles = new Set<string>(scopesForRole(session.user.role));
  const misScopes = (grant?.scopes ?? [])
    .filter((scope): scope is ApiScope => ejercibles.has(scope) && scope in API_SCOPE_META)
    .map((scope) => ({ value: scope as string, ...API_SCOPE_META[scope] }));

  const catalogo = API_SCOPES.map((scope) => ({ value: scope as string, ...API_SCOPE_META[scope] }));

  return (
    <div className="space-y-10">
      {esAdmin ? (
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Acceso por API</h2>
            <p className="text-sm text-gray-500 mt-1">
              A quién has autorizado a usar la API y el MCP, con qué permisos y hasta cuándo.
              Retirar una autorización revoca también las claves que colgaban de ella.
            </p>
          </div>
          <ApiGrantsClient
            grants={concesiones.map((g) => ({
              id: g.id,
              userLabel: g.userName ?? g.userEmail,
              userRole: g.userRole,
              scopeLabels: g.scopes.map(
                (scope) => API_SCOPE_META[scope as ApiScope]?.label ?? scope,
              ),
              companyCount: g.companyIds.length,
              marcaCount: g.marcas.length,
              expiresAt: g.expiresAt,
              revokedAt: g.revokedAt,
              note: g.note,
              grantedByName: g.grantedByName,
              liveKeys: g.liveKeys,
            }))}
            candidates={candidatos.map((u) => ({
              id: u.id,
              label: u.name ?? u.email,
              role: u.role,
            }))}
            scopeOptions={catalogo}
            companyOptions={companies}
            marcaOptions={MARCA_OPTIONS}
            allKeys={todasLasClaves.map((k) => ({
              id: k.id,
              name: k.name,
              keyPrefix: k.keyPrefix,
              ownerLabel: k.ownerName ?? k.ownerEmail,
              createdAt: k.createdAt,
              lastUsedAt: k.lastUsedAt,
              expiresAt: k.expiresAt,
              revokedAt: k.revokedAt,
            }))}
          />
        </section>
      ) : null}

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Mis claves de API</h2>
          <p className="text-sm text-gray-500 mt-1">
            Credenciales con las que una herramienta externa (el MCP de Claude, un script) lee el
            ERP en tu nombre. Cada clave se muestra una sola vez al crearla.
          </p>
        </div>
        <ApiKeysClient
          canMint={viva}
          noAccessReason={
            grant === null
              ? "No tienes acceso por API concedido. Pídeselo a una persona administradora."
              : grant.revokedAt !== null
                ? "Tu acceso por API se ha retirado. Si lo necesitas, pídelo de nuevo."
                : "Tu acceso por API ha caducado. Pide que te lo renueven para crear claves nuevas."
          }
          grantExpiresAt={grant?.expiresAt ?? null}
          scopeOptions={misScopes}
          keys={misClaves.map((k) => ({
            id: k.id,
            name: k.name,
            keyPrefix: k.keyPrefix,
            scopeLabels: k.scopeLabels,
            createdAt: k.createdAt,
            lastUsedAt: k.lastUsedAt,
            expiresAt: k.expiresAt,
            revokedAt: k.revokedAt,
          }))}
        />
      </section>
    </div>
  );
}
