import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiContext } from "@/lib/api/v1";
import { prisma } from "@/lib/prisma";
import { SOLO_LECTURA, companyWhere, limite, ok, type ToolResult } from "../shared";

export function registerSupplierTools(server: McpServer, ctx: ApiContext): void {
  server.registerTool(
    "list_suppliers",
    {
      description:
        "Lista los proveedores y partners con su rol por defecto, tarifas y usuarios de Jira vinculados.",
      inputSchema: {
        isPartner: z.boolean().optional().describe("Solo partners (true) o solo no-partners (false)"),
        tipo: z.enum(["SERVICIOS", "HERRAMIENTAS"]).optional().describe("Tipo de proveedor"),
        limit: z.number().int().optional().describe("Máximo de proveedores (por defecto 50, tope 200)"),
        offset: z.number().int().min(0).optional(),
      },
      annotations: SOLO_LECTURA,
    },
    async (args): Promise<ToolResult> => {
      const where = {
        ...(args.isPartner !== undefined ? { isPartner: args.isPartner } : {}),
        ...(args.tipo ? { tipo: args.tipo } : {}),
        ...companyWhere(ctx),
      };
      const take = limite(args.limit);
      const skip = args.offset ?? 0;

      const [suppliers, total] = await Promise.all([
        prisma.supplier.findMany({
          where,
          include: {
            defaultRole: { select: { id: true, name: true, ratePerHour: true } },
            jiraUsers: { select: { accountId: true } },
            roles: { select: { id: true, name: true, ratePerHour: true, active: true } },
          },
          orderBy: { name: "asc" },
          take,
          skip,
        }),
        prisma.supplier.count({ where }),
      ]);

      return ok({ items: suppliers, total, hasMore: skip + suppliers.length < total });
    },
  );
}
