import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/prisma";

export function registerProjectTools(server: McpServer): void {
  server.registerTool(
    "list_projects",
    {
      description:
        "Lista todos los proyectos Jira del ERP con su estado, tipo de pricing y número de presupuestos.",
      inputSchema: {
        status: z
          .enum(["NOT_STARTED", "ONGOING", "PAUSED", "DONE", "ARCHIVED"])
          .optional()
          .describe("Filtrar por estado del proyecto"),
      },
    },
    async (args) => {
      const projects = await prisma.jiraProject.findMany({
        where: args.status ? { status: args.status } : undefined,
        select: {
          id: true,
          jiraKey: true,
          name: true,
          status: true,
          isPrecioCerrado: true,
          isBolsasHoras: true,
          isFeeRegular: true,
          _count: { select: { budgets: true, hourBuckets: true } },
        },
        orderBy: { name: "asc" },
      });

      return {
        content: [{ type: "text", text: JSON.stringify(projects, null, 2) }],
      };
    }
  );

  server.registerTool(
    "get_project_details",
    {
      description:
        "Devuelve el detalle completo de un proyecto: presupuestos, bolsas de horas, roles del equipo y tarifas.",
      inputSchema: {
        projectId: z.string().describe("ID del proyecto (UUID interno)"),
      },
    },
    async (args) => {
      const project = await prisma.jiraProject.findUnique({
        where: { id: args.projectId },
        include: {
          budgets: {
            select: {
              id: true,
              name: true,
              status: true,
              type: true,
              region: true,
              _count: { select: { lines: true, paymentTerms: true } },
            },
          },
          hourBuckets: {
            where: { active: true },
            include: {
              role: { select: { name: true, ratePerHour: true } },
            },
          },
          userRoles: {
            include: {
              role: { select: { name: true } },
            },
          },
          regularFeeEntries: {
            include: {
              role: { select: { name: true } },
            },
          },
        },
      });

      if (!project) {
        return {
          content: [{ type: "text", text: `Project not found: ${args.projectId}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(project, null, 2) }],
      };
    }
  );
}
