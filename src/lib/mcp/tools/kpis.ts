import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getAllKPIs } from "@/lib/kpis";

export function registerKpiTools(server: McpServer): void {
  server.registerTool(
    "get_kpis",
    {
      description:
        "Devuelve KPIs financieros del ERP: P&L (cuenta de resultados), cashflow mensual, métricas derivadas, proyecciones y KPIs comerciales de Growth/CRM (leads, conversión por etapa, ciclo de venta, pipeline ponderado). Acepta filtros por año, rango de fechas, marca, línea de negocio y empresa.",
      inputSchema: {
        year: z
          .number()
          .int()
          .min(2020)
          .max(2030)
          .optional()
          .describe("Año fiscal (ej: 2025). Si no se indica, usa el año actual."),
        dateFrom: z
          .string()
          .optional()
          .describe("Fecha inicio en formato ISO (YYYY-MM-DD)"),
        dateTo: z
          .string()
          .optional()
          .describe("Fecha fin en formato ISO (YYYY-MM-DD)"),
        marca: z
          .string()
          .optional()
          .describe(
            'Filtrar por marca: "Gigson Solutions", "Gigson", "Awesomely", "LaTroupe"'
          ),
        companyId: z
          .string()
          .optional()
          .describe(
            'ID de empresa. Usar "consolidated" para vista consolidada.'
          ),
        lineOfBusiness: z
          .string()
          .optional()
          .describe(
            'Línea de negocio dentro de la marca, solo para KPIs comerciales (p.ej. "GENERAL", "ODOO"). Si no se indica, agrega todas las líneas.'
          ),
      },
    },
    async (args) => {
      const kpis = await getAllKPIs({
        year: args.year,
        dateFrom: args.dateFrom ? new Date(args.dateFrom) : undefined,
        dateTo: args.dateTo ? new Date(args.dateTo) : undefined,
        marca: args.marca,
        companyId: args.companyId,
        lineOfBusiness: args.lineOfBusiness,
      });

      return {
        content: [{ type: "text", text: JSON.stringify(kpis, null, 2) }],
      };
    }
  );
}
