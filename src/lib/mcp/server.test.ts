/**
 * El gating de herramientas del MCP del ERP.
 *
 * Lo que se afirma aquí no es qué devuelve cada herramienta, sino **cuáles existen**
 * para cada juego de permisos. Es la propiedad que más barato se rompe y más caro se
 * detecta: si una herramienta de escritura se registrara con una clave que no tiene su
 * permiso, el fallo no daría un error — daría una escritura.
 *
 * Los dos últimos son reglas, no casos: ninguna herramienta que escriba puede quedarse
 * sin `readOnlyHint: false` (ese hint es lo que hace que el cliente pida confirmación),
 * y ninguna descripción puede volver a llevar un id de producción dentro.
 */
import { describe, expect, it, vi } from "vitest";
import type { ApiContext } from "@/lib/api/v1";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/kpis", () => ({ getAllKPIs: vi.fn(), getCashflowKPIs: vi.fn() }));
vi.mock("@/lib/reconciliation", () => ({ getHourlyReconciliation: vi.fn() }));
vi.mock("@/lib/cash-balance", () => ({ getCashBalance: vi.fn() }));
vi.mock("@/lib/writes", () => ({
  classifyInvoice: vi.fn(),
  setProjectStatus: vi.fn(),
  upsertBudgetDraft: vi.fn(),
}));

const { createMcpServer } = await import("@/lib/mcp/server");

type ToolInfo = { annotations?: { readOnlyHint?: boolean }; description?: string };

function herramientas(scopes: string[]): Record<string, ToolInfo> {
  const ctx: ApiContext = {
    keyId: "k1",
    userId: "u1",
    role: "ADMIN",
    scopes: scopes as ApiContext["scopes"],
    companyIds: [],
    marcas: [],
  };
  const server = createMcpServer(ctx);
  return (server as unknown as { _registeredTools: Record<string, ToolInfo> })._registeredTools;
}

const ESCRITURA = ["classify_invoice", "set_project_status", "upsert_budget_draft"];

describe("qué herramientas se registran", () => {
  it("una clave sin permisos solo puede preguntar qué sociedades alcanza", () => {
    expect(Object.keys(herramientas([]))).toEqual(["list_companies"]);
  });

  it("`invoices:read` trae las facturas y NINGUNA de escritura", () => {
    const nombres = Object.keys(herramientas(["invoices:read"]));

    expect(nombres).toContain("list_invoices");
    expect(nombres).toContain("get_invoice_detail");
    for (const nombre of ESCRITURA) expect(nombres).not.toContain(nombre);
  });

  it("leer facturas no da permiso para clasificarlas", () => {
    expect(Object.keys(herramientas(["invoices:read"]))).not.toContain("classify_invoice");
    expect(Object.keys(herramientas(["invoices:classify"]))).toContain("classify_invoice");
  });

  it("`finance:read` NO abre la tesorería: son permisos distintos a propósito", () => {
    expect(Object.keys(herramientas(["finance:read"]))).not.toContain("get_cash_balance");
    expect(Object.keys(herramientas(["cash:read"]))).toContain("get_cash_balance");
  });

  it("las nóminas no se exponen al MCP en ninguna circunstancia, ni con su permiso", () => {
    const todas = Object.keys(
      herramientas([
        "projects:read",
        "invoices:read",
        "suppliers:read",
        "budgets:read",
        "finance:read",
        "cash:read",
        "payroll:read",
        "crm:read",
        "ops:read",
        "invoices:classify",
        "projects:write",
        "budgets:write",
      ]),
    );

    expect(todas.filter((nombre) => nombre.includes("payroll") || nombre.includes("employee"))).toEqual([]);
  });
});

describe("anotaciones y descripciones", () => {
  it("toda herramienta que escribe declara readOnlyHint: false", () => {
    const todas = herramientas(["invoices:classify", "projects:write", "budgets:write"]);

    for (const nombre of ESCRITURA) {
      expect(todas[nombre]?.annotations?.readOnlyHint, nombre).toBe(false);
    }
  });

  it("ninguna descripción lleva un id de producción dentro", () => {
    const todas = herramientas([
      "projects:read",
      "invoices:read",
      "suppliers:read",
      "budgets:read",
      "finance:read",
      "cash:read",
      "ops:read",
    ]);

    // Los cuid de este ERP empiezan por "cm" y tienen 25 caracteres.
    for (const [nombre, tool] of Object.entries(todas)) {
      expect(tool.description ?? "", nombre).not.toMatch(/\bcm[a-z0-9]{23}\b/);
    }
  });
});
