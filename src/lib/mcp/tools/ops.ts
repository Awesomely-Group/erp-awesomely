import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiContext } from "@/lib/api/v1";
import { prisma } from "@/lib/prisma";
import { SOLO_LECTURA, companyWhere, limite, ok, type ToolResult } from "../shared";

/** Estado de las integraciones: para responder "¿por qué faltan facturas de ayer?". */
export function registerOpsTools(server: McpServer, ctx: ApiContext): void {
  server.registerTool(
    "list_sync_logs",
    {
      description:
        "Historial de sincronizaciones (Holded, Jira…) con su resultado, cuántas filas movieron y el " +
        "error si lo hubo. Útil para explicar por qué faltan datos de un día.",
      inputSchema: {
        source: z.string().optional().describe("Filtrar por origen, p. ej. HOLDED o JIRA"),
        limit: z.number().int().optional().describe("Máximo de entradas (por defecto 20, tope 200)"),
      },
      annotations: SOLO_LECTURA,
    },
    async (args): Promise<ToolResult> => {
      const logs = await prisma.syncLog.findMany({
        where: { ...(args.source ? { source: args.source as never } : {}), ...companyWhere(ctx) },
        select: {
          id: true,
          source: true,
          result: true,
          startedAt: true,
          finishedAt: true,
          invoicesSynced: true,
          projectsSynced: true,
          errorMessage: true,
        },
        orderBy: { startedAt: "desc" },
        take: limite(args.limit, 20),
      });
      return ok(logs);
    },
  );
}
