/**
 * Las rutas de `/api/v1`, probadas como handlers.
 *
 * No se levanta un servidor a propósito: el ERP solo sabe hablar con Neon
 * (`src/lib/prisma.ts` usa siempre `@prisma/adapter-neon`, que va por WebSocket), así
 * que no hay forma de correrlo contra un Postgres local sin tocar esa elección — y
 * tocarla destapa que algún componente **cliente** acaba importando `prisma`, que es
 * otro problema y más grande. Mientras eso siga así, la verificación honesta de estas
 * rutas es esta: invocar el handler con `prisma` mockeado.
 *
 * Lo que se afirma aquí es lo que de verdad protege los datos:
 *
 * - **Sin el scope no se ejecuta el handler.** No basta con que responda 403: si el
 *   cuerpo llegara a correr, ya habría leído la base.
 * - **La frontera de sociedad entra en el `where`.** Una clave acotada no puede leer
 *   las facturas de la otra sociedad, y eso se comprueba sobre el argumento real que
 *   recibe Prisma, no sobre la respuesta.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiIdentity } from "@/lib/api-keys";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    invoice: { findMany: vi.fn(), count: vi.fn() },
    jiraProject: { findMany: vi.fn(), count: vi.fn() },
    employee: { findMany: vi.fn(), count: vi.fn() },
  },
}));

vi.mock("@/lib/api-keys", () => ({ resolveApiIdentity: vi.fn() }));

const { prisma } = await import("@/lib/prisma");
const { resolveApiIdentity } = await import("@/lib/api-keys");

const { GET: getInvoices } = await import("@/app/api/v1/invoices/route");
const { GET: getPayroll } = await import("@/app/api/v1/payroll/route");

function identidad(overrides: Partial<ApiIdentity> = {}): ApiIdentity {
  return {
    keyId: "k1",
    userId: "u1",
    role: "ADMIN",
    scopes: ["invoices:read"],
    companyIds: [],
    marcas: [],
    ...overrides,
  };
}

function peticion(query = ""): Request {
  return new Request(`https://erp.test/api/v1/invoices${query}`, {
    headers: { authorization: "Bearer erp_loquesea" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.invoice.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.invoice.count).mockResolvedValue(0 as never);
  vi.mocked(prisma.employee.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.employee.count).mockResolvedValue(0 as never);
});

describe("el guard de scope", () => {
  it("sin cabecera responde 401 y no toca la base", async () => {
    const respuesta = await getInvoices(new Request("https://erp.test/api/v1/invoices"));

    expect(respuesta.status).toBe(401);
    expect(prisma.invoice.findMany).not.toHaveBeenCalled();
  });

  it("una clave que no resuelve responde 401, sin decir por qué", async () => {
    vi.mocked(resolveApiIdentity).mockResolvedValue(null);

    const respuesta = await getInvoices(peticion());

    expect(respuesta.status).toBe(401);
    await expect(respuesta.json()).resolves.toMatchObject({
      error: { code: "unauthorized", message: "API key no válida" },
    });
  });

  it("sin el scope responde 403 y el handler NO llega a consultar", async () => {
    vi.mocked(resolveApiIdentity).mockResolvedValue(identidad({ scopes: ["projects:read"] }));

    const respuesta = await getInvoices(peticion());

    expect(respuesta.status).toBe(403);
    await expect(respuesta.json()).resolves.toMatchObject({
      error: { code: "forbidden_scope", scope: "invoices:read" },
    });
    expect(prisma.invoice.findMany).not.toHaveBeenCalled();
  });

  it("las nóminas piden su propio scope, no vale `invoices:read`", async () => {
    vi.mocked(resolveApiIdentity).mockResolvedValue(identidad({ scopes: ["invoices:read"] }));

    const respuesta = await getPayroll(new Request("https://erp.test/api/v1/payroll", {
      headers: { authorization: "Bearer erp_loquesea" },
    }));

    expect(respuesta.status).toBe(403);
    expect(prisma.employee.findMany).not.toHaveBeenCalled();
  });
});

describe("la frontera de sociedad llega al where", () => {
  it("una credencial sin acotar no filtra por sociedad", async () => {
    vi.mocked(resolveApiIdentity).mockResolvedValue(identidad());

    await getInvoices(peticion());

    const where = vi.mocked(prisma.invoice.findMany).mock.calls[0]![0]!.where!;
    expect(where).not.toHaveProperty("companyId");
  });

  it("una credencial acotada filtra siempre, aunque no se pida nada", async () => {
    vi.mocked(resolveApiIdentity).mockResolvedValue(identidad({ companyIds: ["c1"] }));

    await getInvoices(peticion());

    expect(vi.mocked(prisma.invoice.findMany).mock.calls[0]![0]!.where).toMatchObject({
      companyId: { in: ["c1"] },
    });
  });

  it("pedir una sociedad fuera de alcance no devuelve nada, en vez de confirmar que existe", async () => {
    vi.mocked(resolveApiIdentity).mockResolvedValue(identidad({ companyIds: ["c1"] }));

    await getInvoices(peticion("?companyId=c2"));

    expect(vi.mocked(prisma.invoice.findMany).mock.calls[0]![0]!.where).toMatchObject({
      companyId: { in: [] },
    });
  });

  it("la marca de la credencial también entra en el where", async () => {
    vi.mocked(resolveApiIdentity).mockResolvedValue(identidad({ marcas: ["LaTroupe"] }));

    await getInvoices(peticion());

    expect(vi.mocked(prisma.invoice.findMany).mock.calls[0]![0]!.where).toMatchObject({
      marca: { in: ["LaTroupe"] },
    });
  });

  it("las facturas borradas en Holded no reaparecen por API", async () => {
    vi.mocked(resolveApiIdentity).mockResolvedValue(identidad());

    await getInvoices(peticion());

    expect(vi.mocked(prisma.invoice.findMany).mock.calls[0]![0]!.where).toMatchObject({
      holdedStatus: { not: -1 },
      removedFromHoldedAt: null,
    });
  });
});

describe("paginación", () => {
  it("un limit desbocado se rechaza antes de consultar", async () => {
    vi.mocked(resolveApiIdentity).mockResolvedValue(identidad());

    const respuesta = await getInvoices(peticion("?limit=999999"));

    expect(respuesta.status).toBe(400);
    expect(prisma.invoice.findMany).not.toHaveBeenCalled();
  });
});
