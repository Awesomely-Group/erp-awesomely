import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerProjectTools } from "./tools/projects";
import { registerInvoiceTools } from "./tools/invoices";
import { registerKpiTools } from "./tools/kpis";
import { registerSupplierTools } from "./tools/suppliers";
import { registerBudgetTools } from "./tools/budgets";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "erp-awesomely",
    version: "1.0.0",
  });

  registerProjectTools(server);
  registerInvoiceTools(server);
  registerKpiTools(server);
  registerSupplierTools(server);
  registerBudgetTools(server);

  return server;
}
