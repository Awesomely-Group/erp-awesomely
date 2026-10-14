import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiContext } from "@/lib/api/v1";
import { prisma } from "@/lib/prisma";
import { SOLO_LECTURA, companyWhere, limite, ok, type ToolResult } from "../shared";

export function registerBudgetTools(server: McpServer, ctx: ApiContext): void {
  server.registerTool(
    "list_budgets",
    {
      description:
        "Lista presupuestos con sus líneas y condiciones de pago. Se puede filtrar por proyecto y estado.",
      inputSchema: {
        projectId: z.string().optional().describe("ID del proyecto cuyos presupuestos quieres"),
        status: z
          .enum(["DRAFT", "ACTIVE", "COMPLETED", "ARCHIVED"])
          .optional()
          .describe("Filtrar por estado"),
        limit: z.number().int().optional().describe("Máximo de presupuestos (por defecto 20, tope 200)"),
        offset: z.number().int().min(0).optional(),
      },
      annotations: SOLO_LECTURA,
    },
    async (args): Promise<ToolResult> => {
      const where = {
        ...(args.projectId ? { projectId: args.projectId } : {}),
        ...(args.status ? { status: args.status } : {}),
        ...companyWhere(ctx),
      };
      // Por defecto 20 y no 50: cada presupuesto arrastra sus líneas y sus plazos, así
      // que una página de cincuenta es mucho texto para lo que suele preguntarse.
      const take = limite(args.limit, 20);
      const skip = args.offset ?? 0;

      const [budgets, total] = await Promise.all([
        prisma.budget.findMany({
          where,
          include: {
            project: { select: { id: true, name: true, jiraKey: true } },
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
              select: { id: true, order: true, valueType: true, value: true, dueDate: true, description: true },
              orderBy: { order: "asc" },
            },
          },
          orderBy: { createdAt: "desc" },
          take,
          skip,
        }),
        prisma.budget.count({ where }),
      ]);

      return ok({ items: budgets, total, hasMore: skip + budgets.length < total });
    },
  );
}
