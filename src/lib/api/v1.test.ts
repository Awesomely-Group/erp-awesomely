/**
 * La fontanería de `/api/v1`.
 *
 * Dos cosas se prueban aquí y ninguna es cosmética:
 *
 * - **El tope de paginación.** Sin él, un `?limit=999999` se lleva el histórico entero
 *   de facturas en una sola petición.
 * - **La frontera de sociedad.** `companyWhere` tiene que devolver `{}` *solo* cuando
 *   la credencial no está acotada; si lo devolviera por error en una acotada, la clave
 *   leería la caja de la otra sociedad sin que nada avisara. Y un id fuera de alcance
 *   tiene que dar vacío, no 403: decir "no puedes ver esa" ya confirma que existe.
 */
import { describe, expect, it } from "vitest";
import type { ApiContext } from "@/lib/api/v1";
import { companyWhere, marcaWhere, narrowCompanyFilter, page, paged } from "@/lib/api/v1";

function contexto(overrides: Partial<ApiContext> = {}): ApiContext {
  return {
    keyId: "k1",
    userId: "u1",
    role: "ADMIN",
    scopes: [],
    companyIds: [],
    marcas: [],
    ...overrides,
  };
}

function url(query: string): URL {
  return new URL(`https://erp.test/api/v1/invoices${query}`);
}

describe("page", () => {
  it("sin parámetros usa el tamaño por defecto", () => {
    expect(page(url(""))).toEqual({ limit: 50, offset: 0 });
  });

  it("rechaza un limit por encima del tope", async () => {
    const resultado = page(url("?limit=999999"));

    expect(resultado).toBeInstanceOf(Response);
    await expect((resultado as Response).json()).resolves.toMatchObject({
      error: { code: "bad_request" },
    });
    expect((resultado as Response).status).toBe(400);
  });

  it.each(["?limit=0", "?limit=-1", "?limit=abc", "?offset=-5"])("rechaza %s", (query) => {
    expect(page(url(query))).toBeInstanceOf(Response);
  });
});

describe("paged", () => {
  it("dice si quedan más páginas", async () => {
    const respuesta = paged([1, 2], 10, { limit: 2, offset: 0 });

    await expect(respuesta.json()).resolves.toMatchObject({
      data: [1, 2],
      page: { limit: 2, offset: 0, total: 10, hasMore: true },
    });
  });

  it("la última página no promete más", async () => {
    const respuesta = paged([9, 10], 10, { limit: 2, offset: 8 });

    await expect(respuesta.json()).resolves.toMatchObject({ page: { hasMore: false } });
  });
});

describe("companyWhere / marcaWhere", () => {
  it("una credencial sin acotar no añade filtro", () => {
    expect(companyWhere(contexto())).toEqual({});
    expect(marcaWhere(contexto())).toEqual({});
  });

  it("una credencial acotada filtra SIEMPRE, nunca devuelve {}", () => {
    expect(companyWhere(contexto({ companyIds: ["c1"] }))).toEqual({ companyId: { in: ["c1"] } });
    expect(marcaWhere(contexto({ marcas: ["LaTroupe"] }))).toEqual({ marca: { in: ["LaTroupe"] } });
  });
});

describe("narrowCompanyFilter", () => {
  it("sin petición y sin acotar, no filtra", () => {
    expect(narrowCompanyFilter(contexto(), null)).toBeUndefined();
  });

  it("sin petición y acotada, filtra por lo permitido", () => {
    expect(narrowCompanyFilter(contexto({ companyIds: ["c1", "c2"] }), null)).toEqual({
      in: ["c1", "c2"],
    });
  });

  it("una sociedad permitida se acepta tal cual", () => {
    expect(narrowCompanyFilter(contexto({ companyIds: ["c1"] }), "c1")).toBe("c1");
  });

  it("una sociedad fuera de alcance devuelve vacío, no un 403 que confirme que existe", () => {
    expect(narrowCompanyFilter(contexto({ companyIds: ["c1"] }), "c2")).toEqual({ in: [] });
  });
});
