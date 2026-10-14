/**
 * Lo que comparten las herramientas MCP del ERP.
 *
 * Dos cosas que antes no existían y ahora son obligatorias en toda herramienta:
 *
 * - **El contexto de la credencial viaja por clausura**, nunca como argumento. El
 *   modelo no elige sociedad ni marca; lo que puede ver lo decidió un ADMIN al
 *   conceder. El `companyId` que alguna herramienta sigue aceptando solo acota dentro
 *   de lo permitido.
 * - **Todo lo que lista, pagina.** `list_budgets`, `list_suppliers` y `list_projects`
 *   devolvían la tabla entera: funcionaba con treinta filas y deja de funcionar con
 *   mil, y un modelo que recibe mil filas gasta la ventana en ellas.
 */
import type { ApiContext } from "@/lib/api/v1";

export type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

export function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export function fail(message: string, detail?: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify({ error: message, ...(detail ?? {}) }, null, 2) }],
    isError: true,
  };
}

export const SOLO_LECTURA = { readOnlyHint: true } as const;
/** Las de escritura se anotan así para que el cliente pida confirmación antes. */
export const ESCRIBE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true } as const;

const MAX_LIMIT = 200;

/** Acota un `limit` pedido por el modelo. Sin tope, una tabla grande se cuela entera. */
export function limite(valor: number | undefined, porDefecto = 50): number {
  if (valor === undefined) return porDefecto;
  return Math.min(Math.max(1, Math.trunc(valor)), MAX_LIMIT);
}

export function companyWhere(ctx: ApiContext): { companyId?: { in: string[] } } {
  return ctx.companyIds.length === 0 ? {} : { companyId: { in: ctx.companyIds } };
}

export function marcaWhere(ctx: ApiContext): { marca?: { in: string[] } } {
  return ctx.marcas.length === 0 ? {} : { marca: { in: ctx.marcas } };
}

/**
 * Acota la sociedad que pida el modelo a lo que la credencial permite. Fuera de
 * alcance devuelve un filtro imposible en vez de un error: no se confirma qué existe.
 */
export function narrowCompany(ctx: ApiContext, requested?: string): { in: string[] } | string | undefined {
  if (!requested) return ctx.companyIds.length === 0 ? undefined : { in: ctx.companyIds };
  if (ctx.companyIds.length === 0) return requested;
  return ctx.companyIds.includes(requested) ? requested : { in: [] };
}
