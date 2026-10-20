import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getAllKPIs } from "@/lib/kpis";
import type { ApiContext } from "@/lib/api/v1";

export function registerKpiTools(server: McpServer, ctx: ApiContext): void {
  server.registerTool(
    "get_kpis",
    {
      description:
        "Devuelve KPIs financieros del ERP: P&L (cuenta de resultados), cashflow mensual, métricas derivadas, proyecciones, KPIs comerciales de Growth/CRM (leads, conversión por etapa, ciclo de venta, pipeline ponderado) y KPIs de campañas de pago de Google Ads (impresiones, clics, coste, CTR, CPC, tasa de conversión y CPL en versión Google Ads y versión CRM, CPL cualificado, CPA, gasto vs presupuesto, serie temporal). Acepta filtros por año, rango de fechas, marca, línea de negocio, empresa y campaña.",
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
            'Línea de negocio dentro de la marca, solo para KPIs comerciales y de campañas (p.ej. "GENERAL", "ODOO"). Si no se indica, agrega todas las líneas.'
          ),
        campaignId: z
          .string()
          .optional()
          .describe("Id interno de una campaña de pago (AdCampaign.id), solo para los KPIs de campañas."),
      },
    },
    async (args) => {
      // Si la credencial está acotada a una sola sociedad o marca, **esa manda** y el
      // parámetro que mande el modelo se ignora: una herramienta no puede ampliar el
      // alcance que un ADMIN concedió. Con varias permitidas sí puede elegir entre ellas.
      const companyId = ctx.companyIds.length === 1 ? ctx.companyIds[0] : args.companyId;
      const marca = ctx.marcas.length === 1 ? ctx.marcas[0] : args.marca;

      if (
        companyId &&
        companyId !== "consolidated" &&
        ctx.companyIds.length > 0 &&
        !ctx.companyIds.includes(companyId)
      ) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "Esa sociedad no existe" }, null, 2) }],
          isError: true as const,
        };
      }

      const kpis = await getAllKPIs({
        year: args.year,
        dateFrom: args.dateFrom ? new Date(args.dateFrom) : undefined,
        dateTo: args.dateTo ? new Date(args.dateTo) : undefined,
        marca,
        companyId,
        lineOfBusiness: args.lineOfBusiness,
        campaignId: args.campaignId,
      });

      return {
        content: [{ type: "text", text: JSON.stringify(kpis, null, 2) }],
      };
    }
  );
}
