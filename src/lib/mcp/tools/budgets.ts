import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/prisma";

export function registerBudgetTools(server: McpServer): void {
  server.registerTool(
    "list_budgets",
    {
      description:
        "Lista presupuestos del ERP con sus líneas de detalle y plazos de pago. Se puede filtrar por proyecto.",
      inputSchema: {
        projectId: z
          .string()
          .optional()
          .describe("ID del proyecto para filtrar sus presupuestos"),
        status: z
          .enum(["DRAFT", "ACTIVE", "COMPLETED", "ARCHIVED"])
          .optional()
          .describe("Filtrar por estado del presupuesto"),
      },
    },
    async (args) => {
      const budgets = await prisma.budget.findMany({
        where: {
          ...(args.projectId ? { projectId: args.projectId } : {}),
          ...(args.status ? { status: args.status } : {}),
        },
        include: {
          project: {
            select: { id: true, name: true, jiraKey: true },
          },
          lines: {
            select: {
              id: true,
              phase: true,
              task: true,
              estimatedHours: true,
              pvpPerHour: true,
              costPerHour: true,
            },
            orderBy: [{ phase: "asc" }, { task: "asc" }],
          },
          paymentTerms: {
            select: {
              id: true,
              order: true,
              valueType: true,
              value: true,
              dueDate: true,
              description: true,
            },
            orderBy: { order: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      return {
        content: [{ type: "text", text: JSON.stringify(budgets, null, 2) }],
      };
    }
  );
}
