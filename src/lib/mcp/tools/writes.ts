import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiContext } from "@/lib/api/v1";
import { classifyInvoice, setProjectStatus, upsertBudgetDraft } from "@/lib/writes";
import { ESCRIBE, fail, ok, type ToolResult } from "../shared";

/**
 * Las tres herramientas que escriben. Cada una se registra solo si la credencial trae
 * su permiso, así que una clave de lectura ni las ve en `tools/list`.
 *
 * Las tres van anotadas con `readOnlyHint: false` para que el cliente pida confirmación
 * antes de ejecutarlas, y las tres dejan rastro en `AuditLog` con la credencial usada.
 */
export function registerClassifyTools(server: McpServer, ctx: ApiContext): void {
  server.registerTool(
    "classify_invoice",
    {
      description:
        "Clasifica todas las líneas de una factura a un proyecto y/o una marca, y recalcula la marca y " +
        "el estado de la factura. Es lo mismo que hace la pantalla de clasificación, y se deshace igual.",
      inputSchema: {
        invoiceId: z.string().describe("ID de la factura (lo da list_invoices)"),
        projectId: z.string().nullish().describe("Proyecto al que imputarla; null para dejarla sin proyecto"),
        marca: z.string().nullish().describe("Marca; si se omite se deriva de las clasificaciones"),
        notes: z.string().max(500).nullish().describe("Nota de por qué se clasifica así"),
      },
      annotations: ESCRIBE,
    },
    async (args): Promise<ToolResult> => {
      const resultado = await classifyInvoice(ctx, args);
      return resultado.ok ? ok(resultado.data) : fail(resultado.error);
    },
  );
}

export function registerProjectWriteTools(server: McpServer, ctx: ApiContext): void {
  server.registerTool(
    "set_project_status",
    {
      description:
        "Cambia el estado de un proyecto. No crea ni borra proyectos: eso se hace desde la pantalla.",
      inputSchema: {
        projectId: z.string().describe("ID del proyecto (lo da list_projects)"),
        status: z
          .enum(["NOT_STARTED", "ONGOING", "PAUSED", "DONE", "ARCHIVED"])
          .describe("Estado nuevo"),
      },
      annotations: ESCRIBE,
    },
    async (args): Promise<ToolResult> => {
      const resultado = await setProjectStatus(ctx, args);
      return resultado.ok ? ok(resultado.data) : fail(resultado.error);
    },
  );
}

export function registerBudgetWriteTools(server: McpServer, ctx: ApiContext): void {
  server.registerTool(
    "upsert_budget_draft",
    {
      description:
        "Crea o actualiza un presupuesto en BORRADOR. Nunca lo aprueba, lo envía ni lo firma: eso tiene " +
        "efecto frente a un cliente y lo hace una persona. `externalRef` es tuyo y estable: con él, " +
        "reintentar no duplica el presupuesto.",
      inputSchema: {
        externalRef: z.string().min(1).max(200).describe("Identificador estable tuyo, p. ej. \"propuesta-acme-2026-10\""),
        name: z.string().min(1).max(200).describe("Nombre del presupuesto"),
        amount: z.number().min(0).describe("Importe total"),
        type: z
          .enum(["PRECIO_CERRADO", "BOLSA_DE_HORAS", "FEE_REGULAR"])
          .describe("Modelo de facturación del presupuesto"),
        projectId: z.string().nullish().describe("Proyecto al que pertenece, si ya existe"),
        companyId: z.string().nullish().describe("Sociedad que lo emite"),
      },
      annotations: ESCRIBE,
    },
    async (args): Promise<ToolResult> => {
      const resultado = await upsertBudgetDraft(ctx, args);
      return resultado.ok ? ok(resultado.data) : fail(resultado.error);
    },
  );
}
