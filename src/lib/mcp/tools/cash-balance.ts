import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiContext } from "@/lib/api/v1";
import { getCashBalance } from "@/lib/cash-balance";
import { SOLO_LECTURA, ok, type ToolResult } from "../shared";

/**
 * El cálculo vive en `src/lib/cash-balance.ts`, compartido con `/api/v1/cash-balance`:
 * dos puertas al mismo dato no deben tener dos copias de la suma.
 *
 * La descripción ya **no lleva ids de sociedad de producción** dentro. Los traía para
 * que el modelo pudiera filtrar sin preguntar, y eso convertía la documentación de una
 * herramienta en un listado de identificadores reales. El descubrimiento se hace con
 * `list_companies`, que además sale ya acotado por la credencial.
 */
export function registerCashBalanceTools(server: McpServer, ctx: ApiContext): void {
  server.registerTool(
    "get_cash_balance",
    {
      description:
        "Saldo de caja por sociedad y consolidado, calculado desde los pagos registrados en el ERP: " +
        "cobros y pagos realizados, posición neta y pendientes. Usa list_companies para saber qué " +
        "sociedades puedes consultar.",
      inputSchema: {
        companyId: z
          .string()
          .optional()
          .describe("Acotar a una sociedad concreta; si se omite, todas las que alcances"),
      },
      annotations: SOLO_LECTURA,
    },
    async (args): Promise<ToolResult> =>
      ok(await getCashBalance({ allowedCompanyIds: ctx.companyIds, companyId: args.companyId ?? null })),
  );
}
