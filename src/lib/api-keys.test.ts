/**
 * La cadena de rechazos de una credencial.
 *
 * Cada condición de aquí es una puerta que debería estar cerrada, y ninguna da un error
 * visible cuando se queda abierta: da datos servidos a quien ya no debería tenerlos. Dos
 * en particular son nuevas y conviene fijarlas:
 *
 * - **Clave revocada.** Revocar pasó de borrar la fila a marcarla, y lo que antes
 *   validaba la clave solo buscaba el hash. Sin esta comprobación, las claves que la
 *   migración jubila seguirían abriendo la puerta.
 * - **Fuera de la allowlist de SSO.** Es la pertenencia viva del ERP: si quitar un email
 *   de ahí corta el login pero no la clave, la credencial sobrevive a la persona.
 *
 * Se mockea `@/lib/prisma` porque importarlo de verdad abre un cliente contra
 * `DATABASE_URL` — y el de este repo apunta a la base real.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    apiKey: { findUnique: vi.fn(), update: vi.fn() },
    ssoAllowedEmail: { findFirst: vi.fn() },
  },
}));

const { prisma } = await import("@/lib/prisma");
const { resolveApiIdentity, hashApiKey } = await import("@/lib/api-keys");

const AHORA = new Date("2026-10-14T12:00:00.000Z");
const MANANA = new Date("2026-10-15T12:00:00.000Z");
const AYER = new Date("2026-10-13T12:00:00.000Z");

/** Una clave sana: viva, con concesión viva y dueña ADMIN. */
function claveSana(overrides: Record<string, unknown> = {}) {
  return {
    id: "k1",
    userId: "u1",
    scopes: ["invoices:read", "cash:read"],
    companyIds: [],
    marcas: [],
    expiresAt: MANANA,
    revokedAt: null,
    user: { email: "jaume@somosgigson.com", role: "ADMIN" },
    grant: {
      userId: "u1",
      scopes: ["invoices:read", "cash:read"],
      companyIds: [],
      marcas: [],
      expiresAt: MANANA,
      revokedAt: null,
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.ssoAllowedEmail.findFirst).mockResolvedValue({ id: "s1" } as never);
  vi.mocked(prisma.apiKey.update).mockResolvedValue({} as never);
});

describe("resolveApiIdentity — qué deja pasar", () => {
  it("una clave sana devuelve sus scopes efectivos", async () => {
    vi.mocked(prisma.apiKey.findUnique).mockResolvedValue(claveSana() as never);

    const identidad = await resolveApiIdentity("erp_loquesea", AHORA);

    expect(identidad).toMatchObject({ keyId: "k1", userId: "u1", role: "ADMIN" });
    expect(identidad?.scopes).toEqual(["invoices:read", "cash:read"]);
  });

  it("marca `lastUsedAt` en cada petición: sin ese dato, revocar sería a ciegas", async () => {
    vi.mocked(prisma.apiKey.findUnique).mockResolvedValue(claveSana() as never);

    await resolveApiIdentity("erp_loquesea", AHORA);

    expect(prisma.apiKey.update).toHaveBeenCalledWith({
      where: { id: "k1" },
      data: { lastUsedAt: AHORA },
    });
  });

  it("el rol recorta lo que la clave y la concesión conceden", async () => {
    vi.mocked(prisma.apiKey.findUnique).mockResolvedValue(
      claveSana({ user: { email: "otra@somosgigson.com", role: "COMERCIAL" } }) as never,
    );

    const identidad = await resolveApiIdentity("erp_loquesea", AHORA);

    // Tenía `cash:read` concedido, pero un COMERCIAL no puede ejercerlo.
    expect(identidad?.scopes).toEqual([]);
  });
});

describe("resolveApiIdentity — qué corta", () => {
  it.each([
    ["la clave no existe", null],
    ["la clave está revocada", claveSana({ revokedAt: AYER })],
    ["la clave ha caducado", claveSana({ expiresAt: AYER })],
    ["la concesión está revocada", claveSana({ grant: { ...claveSana().grant, revokedAt: AYER } })],
    ["la concesión ha caducado", claveSana({ grant: { ...claveSana().grant, expiresAt: AYER } })],
    ["la concesión es de otra persona", claveSana({ grant: { ...claveSana().grant, userId: "u2" } })],
  ])("%s → sin identidad", async (_caso, fila) => {
    vi.mocked(prisma.apiKey.findUnique).mockResolvedValue(fila as never);

    await expect(resolveApiIdentity("erp_loquesea", AHORA)).resolves.toBeNull();
    // Y no se marca uso: una credencial muerta no deja rastro de actividad.
    expect(prisma.apiKey.update).not.toHaveBeenCalled();
  });

  it("si su email ya no está en la allowlist de SSO, la clave muere con la persona", async () => {
    vi.mocked(prisma.apiKey.findUnique).mockResolvedValue(claveSana() as never);
    vi.mocked(prisma.ssoAllowedEmail.findFirst).mockResolvedValue(null as never);

    await expect(resolveApiIdentity("erp_loquesea", AHORA)).resolves.toBeNull();
  });
});

describe("resolveApiIdentity — frontera de datos", () => {
  it("una clave no puede alcanzar una sociedad que su concesión no da", async () => {
    vi.mocked(prisma.apiKey.findUnique).mockResolvedValue(
      claveSana({
        companyIds: ["c1", "c2"],
        grant: { ...claveSana().grant, companyIds: ["c1"] },
      }) as never,
    );

    const identidad = await resolveApiIdentity("erp_loquesea", AHORA);

    expect(identidad?.companyIds).toEqual(["c1"]);
  });
});

describe("hashApiKey", () => {
  it("es estable y no devuelve el valor en claro", () => {
    const hash = hashApiKey("erp_secreto");

    expect(hash).toBe(hashApiKey("erp_secreto"));
    expect(hash).not.toContain("secreto");
    expect(hash).toHaveLength(64);
  });
});
