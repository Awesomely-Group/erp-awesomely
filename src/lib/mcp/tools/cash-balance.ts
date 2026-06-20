import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/prisma";

interface CompanyCashBalance {
  companyId: string;
  companyName: string;
  salesCollected: number;
  purchasesPaid: number;
  netCashPosition: number;
  pendingToCollect: number;
  pendingToPay: number;
  totalSalesInvoiced: number;
  totalPurchasesInvoiced: number;
}

interface ConsolidatedCashBalance {
  salesCollected: number;
  purchasesPaid: number;
  netCashPosition: number;
  pendingToCollect: number;
  pendingToPay: number;
}

interface CashBalanceResult {
  companies: CompanyCashBalance[];
  consolidated: ConsolidatedCashBalance;
  note: string;
  generatedAt: string;
}

export function registerCashBalanceTools(server: McpServer): void {
  server.registerTool(
    "get_cash_balance",
    {
      description:
        "Devuelve el saldo de caja calculado desde pagos de facturas registrados en el ERP. Para cada empresa muestra cobros realizados (ventas), pagos realizados (compras), posición neta de caja, y pendientes de cobro/pago. Acepta filtro opcional por empresa.",
      inputSchema: {
        companyId: z
          .string()
          .optional()
          .describe(
            "ID de empresa para filtrar. Si no se indica, devuelve todas las empresas activas. IDs conocidos: Gigson SL = cmnbew1zp000004l6pjz4wp0y, Awesomely OÜ = cmnbex183000204l625mrpus9"
          ),
      },
    },
    async (args): Promise<{ content: [{ type: "text"; text: string }] }> => {
      const companyFilter = args.companyId
        ? { id: args.companyId }
        : {};

      const companies = await prisma.company.findMany({
        where: { active: true, ...companyFilter },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });

      const baseInvoiceWhere = {
        holdedStatus: { not: -1 as const },
      };

      const [salesRows, purchaseRows] = await Promise.all([
        prisma.invoice.groupBy({
          by: ["companyId"],
          where: {
            ...baseInvoiceWhere,
            type: "SALE",
            companyId: args.companyId
              ? args.companyId
              : { in: companies.map((c) => c.id) },
          },
          _sum: {
            paymentsTotal: true,
            paymentsPending: true,
            totalEur: true,
          },
        }),
        prisma.invoice.groupBy({
          by: ["companyId"],
          where: {
            ...baseInvoiceWhere,
            type: "PURCHASE",
            companyId: args.companyId
              ? args.companyId
              : { in: companies.map((c) => c.id) },
          },
          _sum: {
            paymentsTotal: true,
            paymentsPending: true,
            totalEur: true,
          },
        }),
      ]);

      const salesByCompany = new Map(
        salesRows.map((r) => [r.companyId, r._sum])
      );
      const purchasesByCompany = new Map(
        purchaseRows.map((r) => [r.companyId, r._sum])
      );

      const companiesResult: CompanyCashBalance[] = companies.map((company) => {
        const sales = salesByCompany.get(company.id);
        const purchases = purchasesByCompany.get(company.id);

        const salesCollected = Number(sales?.paymentsTotal ?? 0);
        const purchasesPaid = Number(purchases?.paymentsTotal ?? 0);
        const pendingToCollect = Number(sales?.paymentsPending ?? 0);
        const pendingToPay = Number(purchases?.paymentsPending ?? 0);
        const totalSalesInvoiced = Number(sales?.totalEur ?? 0);
        const totalPurchasesInvoiced = Number(purchases?.totalEur ?? 0);

        return {
          companyId: company.id,
          companyName: company.name,
          salesCollected,
          purchasesPaid,
          netCashPosition: salesCollected - purchasesPaid,
          pendingToCollect,
          pendingToPay,
          totalSalesInvoiced,
          totalPurchasesInvoiced,
        };
      });

      const consolidated: ConsolidatedCashBalance = companiesResult.reduce(
        (acc, c) => ({
          salesCollected: acc.salesCollected + c.salesCollected,
          purchasesPaid: acc.purchasesPaid + c.purchasesPaid,
          netCashPosition: acc.netCashPosition + c.netCashPosition,
          pendingToCollect: acc.pendingToCollect + c.pendingToCollect,
          pendingToPay: acc.pendingToPay + c.pendingToPay,
        }),
        {
          salesCollected: 0,
          purchasesPaid: 0,
          netCashPosition: 0,
          pendingToCollect: 0,
          pendingToPay: 0,
        }
      );

      const result: CashBalanceResult = {
        companies: companiesResult,
        consolidated,
        note: "Saldo calculado desde pagos de facturas registrados en el ERP. Para saldo bancario real, sincronizar cuentas de tesorería desde Holded.",
        generatedAt: new Date().toISOString(),
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
