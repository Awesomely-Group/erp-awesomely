import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/prisma";
import { SOLO_LECTURA, limite, ok, fail, type ToolResult } from "../shared";

/**
 * No recibe contexto porque `JiraProject` no tiene sociedad: la frontera aparece más
 * abajo, en la factura. Un listado de proyectos es además el dato más inocuo del ERP.
 */
export function registerProjectTools(server: McpServer): void {
  server.registerTool(
    "list_projects",
    {
      description:
        "Lista los proyectos del ERP con su estado, modelo de pricing y número de presupuestos y bolsas.",
      inputSchema: {
        status: z
          .enum(["NOT_STARTED", "ONGOING", "PAUSED", "DONE", "ARCHIVED"])
          .optional()
          .describe("Filtrar por estado del proyecto"),
        limit: z.number().int().optional().describe("Máximo de proyectos (por defecto 50, tope 200)"),
        offset: z.number().int().min(0).optional().describe("Desde qué fila, para paginar"),
      },
      annotations: SOLO_LECTURA,
    },
    async (args): Promise<ToolResult> => {
      const where = args.status ? { status: args.status } : {};
      const take = limite(args.limit);
      const skip = args.offset ?? 0;

      const [projects, total] = await Promise.all([
        prisma.jiraProject.findMany({
          where,
          select: {
            id: true,
            jiraKey: true,
            name: true,
            status: true,
            isPrecioCerrado: true,
            isBolsasHoras: true,
            isFeeRegular: true,
            giroProjectId: true,
            _count: { select: { budgets: true, hourBuckets: true } },
          },
          orderBy: { name: "asc" },
          take,
          skip,
        }),
        prisma.jiraProject.count({ where }),
      ]);

      return ok({ items: projects, total, hasMore: skip + projects.length < total });
    },
  );

  server.registerTool(
    "get_project_details",
    {
      description:
        "Detalle de un proyecto: presupuestos, bolsas de horas activas, roles del equipo y tarifas.",
      inputSchema: { projectId: z.string().describe("ID interno del proyecto (lo da list_projects)") },
      annotations: SOLO_LECTURA,
    },
    async (args): Promise<ToolResult> => {
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
            include: { role: { select: { name: true, ratePerHour: true } } },
          },
          userRoles: { include: { role: { select: { name: true } } } },
          regularFeeEntries: { include: { role: { select: { name: true } } } },
        },
      });

      if (!project) return fail(`No existe el proyecto ${args.projectId}`);
      return ok(project);
    },
  );
}
