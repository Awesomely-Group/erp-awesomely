import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiContext } from "@/lib/api/v1";
import { getCashflowKPIs } from "@/lib/kpis";
import { getHourlyReconciliation } from "@/lib/reconciliation";
import { SOLO_LECTURA, fail, ok, type ToolResult } from "../shared";

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha tiene que ser YYYY-MM-DD");

/**
 * Lectura financiera agregada. Todo lo de aquí pide `finance:read`, que es distinto de
 * `cash:read`: estas son cifras que ya circulan en informes, no el saldo ni los pagos.
 *
 * Si la credencial está acotada a una sola sociedad o marca, esa manda y el parámetro
 * del modelo se ignora — no se puede ampliar el alcance desde la herramienta.
 */
export function registerFinanceTools(server: McpServer, ctx: ApiContext): void {
  server.registerTool(
    "get_cashflow",
    {
      description: "Flujo de caja mensual: cobros, pagos y saldo por mes, con los filtros que se indiquen.",
      inputSchema: {
        year: z.number().int().min(2020).max(2040).optional(),
        dateFrom: isoDay.optional(),
        dateTo: isoDay.optional(),
        companyId: z.string().optional(),
        marca: z.string().optional(),
      },
      annotations: SOLO_LECTURA,
    },
    async (args): Promise<ToolResult> => {
      const companyId = ctx.companyIds.length === 1 ? ctx.companyIds[0] : args.companyId;
      const marca = ctx.marcas.length === 1 ? ctx.marcas[0] : args.marca;

      return ok(
        await getCashflowKPIs({
          ...(args.year === undefined ? {} : { year: args.year }),
          ...(args.dateFrom ? { dateFrom: new Date(`${args.dateFrom}T00:00:00.000Z`) } : {}),
          ...(args.dateTo ? { dateTo: new Date(`${args.dateTo}T00:00:00.000Z`) } : {}),
          ...(companyId ? { companyId } : {}),
          ...(marca ? { marca } : {}),
        }),
      );
    },
  );

  server.registerTool(
    "get_hourly_reconciliation",
    {
      description:
        "Cruza las horas aprobadas en Giro con lo facturado, proyecto a proyecto. Responde a si lo " +
        "trabajado y lo cobrado cuadran en un periodo.",
      inputSchema: { from: isoDay, to: isoDay },
      annotations: SOLO_LECTURA,
    },
    async (args): Promise<ToolResult> => {
      const desde = new Date(`${args.from}T00:00:00.000Z`);
      const hasta = new Date(`${args.to}T00:00:00.000Z`);
      if (hasta < desde) return fail("`to` es anterior a `from`");

      return ok(await getHourlyReconciliation(desde, hasta));
    },
  );
}
