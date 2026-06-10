import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/prisma";

export function registerSupplierTools(server: McpServer): void {
  server.registerTool(
    "list_suppliers",
    {
      description:
        "Lista los proveedores/partners del ERP con sus usuarios Jira vinculados, rol por defecto y tarifas.",
      inputSchema: {
        isPartner: z
          .boolean()
          .optional()
          .describe("Filtrar solo partners (true) o no-partners (false)"),
        tipo: z
          .enum(["SERVICIOS", "HERRAMIENTAS"])
          .optional()
          .describe("Tipo de proveedor"),
      },
    },
    async (args) => {
      const suppliers = await prisma.supplier.findMany({
        where: {
          ...(args.isPartner !== undefined
            ? { isPartner: args.isPartner }
            : {}),
          ...(args.tipo ? { tipo: args.tipo } : {}),
        },
        include: {
          defaultRole: {
            select: { id: true, name: true, ratePerHour: true },
          },
          jiraUsers: {
            select: { accountId: true },
          },
          roles: {
            select: {
              id: true,
              name: true,
              ratePerHour: true,
              active: true,
            },
          },
        },
        orderBy: { name: "asc" },
      });

      return {
        content: [{ type: "text", text: JSON.stringify(suppliers, null, 2) }],
      };
    }
  );
}
