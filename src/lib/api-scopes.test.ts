/**
 * Las reglas de permiso de la API del ERP.
 *
 * Se prueban sin base de datos a propósito: son funciones puras, y lo que afirman aquí
 * es la propiedad que de verdad protege los datos — **una clave no puede nunca más que
 * su dueño hoy**. Si esto se rompe no salta ningún error: salta una fuga.
 *
 * Los tres casos que más importan son los de `payroll:read` y `cash:read` (IBAN de
 * personas físicas y saldo de tesorería) y el del perfil COMERCIAL, que por pantalla
 * solo ve `/crm` y no debe poder leer facturación por API.
 */
import { describe, expect, it } from "vitest";
import {
  API_SCOPES,
  effectiveScopes,
  grantExpiry,
  grantScopeError,
  isGrantLive,
  narrowIds,
  scopesForRole,
  type ApiScope,
} from "@/lib/api-scopes";

const TODOS = [...API_SCOPES];

describe("scopesForRole", () => {
  it("un COMERCIAL solo puede ejercer el CRM, que es lo único que ve por pantalla", () => {
    expect(scopesForRole("COMERCIAL")).toEqual(["crm:read"]);
  });

  it("un ADMIN puede ejercerlo todo", () => {
    expect(scopesForRole("ADMIN")).toEqual(TODOS);
  });
});

describe("effectiveScopes — intersección de las tres fuentes", () => {
  it("lo que no está en la clave no se ejerce, aunque la concesión lo dé", () => {
    const efectivo = effectiveScopes({
      keyScopes: ["invoices:read"],
      grantScopes: ["invoices:read", "cash:read"],
      role: "ADMIN",
    });

    expect(efectivo).toEqual(["invoices:read"]);
  });

  it("lo que no está en la concesión no se ejerce, aunque la clave lo pida", () => {
    const efectivo = effectiveScopes({
      keyScopes: ["invoices:read", "payroll:read"],
      grantScopes: ["invoices:read"],
      role: "ADMIN",
    });

    expect(efectivo).toEqual(["invoices:read"]);
  });

  it("bajar de ADMIN a COMERCIAL vacía una clave de facturación sin tocarla", () => {
    const clave = { keyScopes: ["invoices:read", "cash:read"], grantScopes: ["invoices:read", "cash:read"] };

    expect(effectiveScopes({ ...clave, role: "ADMIN" })).toEqual(["invoices:read", "cash:read"]);
    expect(effectiveScopes({ ...clave, role: "COMERCIAL" })).toEqual([]);
  });

  it("devuelve siempre el mismo orden, para que dos llamadas sean comparables", () => {
    const desordenado = effectiveScopes({
      keyScopes: ["cash:read", "projects:read", "invoices:read"],
      grantScopes: ["invoices:read", "cash:read", "projects:read"],
      role: "ADMIN",
    });

    expect(desordenado).toEqual(["projects:read", "invoices:read", "cash:read"]);
  });
});

describe("grantScopeError", () => {
  it("exige marcar algo", () => {
    expect(grantScopeError([], "ADMIN")).toBe("Marca al menos un permiso");
  });

  it("rechaza un permiso inventado", () => {
    expect(grantScopeError(["invoices:delete"], "ADMIN")).toContain("no es un permiso válido");
  });

  it("no deja conceder nóminas ni tesorería a quien no es ADMIN", () => {
    const error = grantScopeError(["payroll:read"], "COMERCIAL");

    expect(error).not.toBeNull();
    expect(error).toContain("Nóminas");
  });

  it("deja conceder lo que el rol sí puede ejercer", () => {
    expect(grantScopeError(["crm:read"], "COMERCIAL")).toBeNull();
    expect(grantScopeError(["payroll:read", "cash:read"], "ADMIN")).toBeNull();
  });
});

describe("narrowIds — la frontera de datos no se puede ampliar", () => {
  it("una clave sin acotar hereda lo que acota la concesión", () => {
    expect(narrowIds([], ["c1"])).toEqual(["c1"]);
  });

  it("una concesión sin acotar deja a la clave acotarse sola", () => {
    expect(narrowIds(["c1"], [])).toEqual(["c1"]);
  });

  it("una clave NO puede alcanzar una sociedad que su concesión no da", () => {
    expect(narrowIds(["c1", "c2"], ["c1"])).toEqual(["c1"]);
  });

  it("sin solape no alcanza nada", () => {
    expect(narrowIds(["c2"], ["c1"])).toEqual([]);
  });
});

describe("isGrantLive", () => {
  const ahora = new Date("2026-10-14T12:00:00.000Z");
  const manana = new Date("2026-10-15T12:00:00.000Z");
  const ayer = new Date("2026-10-13T12:00:00.000Z");

  it("sin concesión no hay acceso", () => {
    expect(isGrantLive(null, ahora)).toBe(false);
  });

  it("una concesión revocada no vale aunque no haya caducado", () => {
    expect(isGrantLive({ revokedAt: ayer, expiresAt: manana }, ahora)).toBe(false);
  });

  it("una concesión caducada no vale aunque nadie la revocara", () => {
    expect(isGrantLive({ revokedAt: null, expiresAt: ayer }, ahora)).toBe(false);
  });

  it("viva es no revocada y sin caducar", () => {
    expect(isGrantLive({ revokedAt: null, expiresAt: manana }, ahora)).toBe(true);
  });
});

describe("grantExpiry", () => {
  it("por defecto 90 días", () => {
    const desde = new Date("2026-01-01T00:00:00.000Z");

    expect(grantExpiry(undefined, desde).toISOString()).toBe("2026-04-01T00:00:00.000Z");
  });
});

describe("el catálogo", () => {
  it("no tiene ningún permiso de borrado: la API del ERP no borra", () => {
    const borrados = (API_SCOPES as readonly ApiScope[]).filter((scope) => scope.includes("delete"));

    expect(borrados).toEqual([]);
  });

  it("solo hay tres permisos de escritura, y ninguno toca dinero ni nóminas", () => {
    const escritura = (API_SCOPES as readonly ApiScope[]).filter(
      (scope) => !scope.endsWith(":read"),
    );

    expect(escritura).toEqual(["invoices:classify", "projects:write", "budgets:write"]);
  });
});
