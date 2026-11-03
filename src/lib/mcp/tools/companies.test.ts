/**
 * `list_companies` acota por el `id` de la sociedad, no por `companyId`.
 *
 * El resto de tablas cuelgan de una sociedad y se filtran con `companyWhere`; `Company`
 * es la propia sociedad y no tiene ese campo. Con una clave sin sociedades asignadas no
 * hay filtro y el fallo no se ve: solo aparece con una clave acotada.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiContext } from "@/lib/api/v1";
import type { ToolResult } from "../shared";

const findMany = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { company: { findMany } } }));

const { registerCompanyTools } = await import("./companies");

function listCompanies(companyIds: string[]): () => Promise<ToolResult> {
  const ctx: ApiContext = {
    keyId: "k1",
    userId: "u1",
    role: "ADMIN",
    scopes: [],
    companyIds,
    marcas: [],
  };
  let handler: (() => Promise<ToolResult>) | undefined;
  const server = {
    registerTool: (_name: string, _config: unknown, cb: () => Promise<ToolResult>): void => {
      handler = cb;
    },
  } as unknown as McpServer;
  registerCompanyTools(server, ctx);
  if (!handler) throw new Error("list_companies no se ha registrado");
  return handler;
}

describe("list_companies", () => {
  beforeEach(() => {
    findMany.mockReset();
    findMany.mockResolvedValue([]);
  });

  it("con una clave acotada filtra por `id`, el campo que existe en `Company`", async () => {
    await listCompanies(["c1", "c2"])();

    expect(findMany.mock.calls[0][0].where).toEqual({ active: true, id: { in: ["c1", "c2"] } });
  });

  it("sin sociedades asignadas no añade filtro de sociedad", async () => {
    await listCompanies([])();

    expect(findMany.mock.calls[0][0].where).toEqual({ active: true });
  });
});
