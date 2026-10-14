/**
 * El servidor MCP del ERP.
 *
 * Se construye **uno por petición**, registrando solo las herramientas que los scopes
 * de la credencial permiten. Es gratis (crear el objeto y registrar unas herramientas
 * no toca la base) y hace que `tools/list` devuelva literalmente distinto según quién
 * pregunte: una clave de facturación no ve la tesorería, y el modelo no puede ni
 * intentarlo. El control de acceso se nota en la superficie, no en un error a mitad de
 * una tarea.
 *
 * El `ApiContext` viaja por **clausura** a cada registro, nunca como argumento de una
 * herramienta: la sociedad y la marca que alcanza una clave las decidió un ADMIN al
 * conceder, no las elige el modelo.
 *
 * **Las nóminas no se exponen aquí en ninguna circunstancia**, ni en lectura. Existe
 * `payroll:read` para la API, pero un dato bancario de una persona física no tiene por
 * qué pasar por la ventana de contexto de un modelo.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiContext } from "@/lib/api/v1";
import { registerBudgetTools } from "./tools/budgets";
import { registerCashBalanceTools } from "./tools/cash-balance";
import { registerCompanyTools } from "./tools/companies";
import { registerFinanceTools } from "./tools/finance";
import { registerInvoiceTools } from "./tools/invoices";
import { registerKpiTools } from "./tools/kpis";
import { registerOpsTools } from "./tools/ops";
import { registerProjectTools } from "./tools/projects";
import { registerSupplierTools } from "./tools/suppliers";
import {
  registerBudgetWriteTools,
  registerClassifyTools,
  registerProjectWriteTools,
} from "./tools/writes";

export function createMcpServer(ctx: ApiContext): McpServer {
  const server = new McpServer({ name: "erp-awesomely", version: "2.0.0" });
  const puede = (scope: string): boolean => ctx.scopes.includes(scope as never);

  // Siempre: saber qué sociedades alcanza esta credencial no revela nada que quien la
  // tiene no sepa ya, y sin ello las demás herramientas necesitarían ids en su
  // descripción — que es justo lo que se acaba de quitar.
  registerCompanyTools(server, ctx);

  if (puede("projects:read")) registerProjectTools(server);
  if (puede("invoices:read")) registerInvoiceTools(server, ctx);
  if (puede("suppliers:read")) registerSupplierTools(server, ctx);
  if (puede("budgets:read")) registerBudgetTools(server, ctx);
  if (puede("finance:read")) {
    registerKpiTools(server, ctx);
    registerFinanceTools(server, ctx);
  }
  if (puede("cash:read")) registerCashBalanceTools(server, ctx);
  if (puede("ops:read")) registerOpsTools(server, ctx);

  if (puede("invoices:classify")) registerClassifyTools(server, ctx);
  if (puede("projects:write")) registerProjectWriteTools(server, ctx);
  if (puede("budgets:write")) registerBudgetWriteTools(server, ctx);

  return server;
}
