import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiContext } from "@/lib/api/v1";
import { prisma } from "@/lib/prisma";
import { SOLO_LECTURA, companyWhere, ok, type ToolResult } from "../shared";

/**
 * Las sociedades que esta credencial alcanza.
 *
 * Existe para que ninguna otra herramienta tenga que llevar ids de producción en su
 * descripción: el modelo pregunta aquí y recibe solo lo suyo.
 */
export function registerCompanyTools(server: McpServer, ctx: ApiContext): void {
  server.registerTool(
    "list_companies",
    {
      description: "Las sociedades del grupo que esta credencial puede consultar, con su id y moneda.",
      inputSchema: {},
      annotations: SOLO_LECTURA,
    },
    async (): Promise<ToolResult> => {
      const companies = await prisma.company.findMany({
        where: { active: true, ...companyWhere(ctx) },
        select: { id: true, name: true, currency: true },
        orderBy: { name: "asc" },
      });
      return ok(companies);
    },
  );
}
