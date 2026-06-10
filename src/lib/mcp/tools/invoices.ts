import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/prisma";
import { invoiceWhereMarca } from "@/lib/org";

export function registerInvoiceTools(server: McpServer): void {
  server.registerTool(
    "list_invoices",
    {
      description:
        "Lista facturas con filtros opcionales. Devuelve un máximo de 50 resultados ordenados por fecha descendente.",
      inputSchema: {
        marca: z
          .string()
          .optional()
          .describe(
            'Filtrar por marca: "Gigson Solutions", "Gigson", "Awesomely", "LaTroupe"'
          ),
        type: z
          .enum(["SALE", "PURCHASE"])
          .optional()
          .describe("Tipo de factura"),
        status: z
          .enum(["PENDING", "PARTIAL", "CLASSIFIED", "SIN_MARCA"])
          .optional()
          .describe("Estado de clasificación"),
        dateFrom: z
          .string()
          .optional()
          .describe("Fecha inicio en formato ISO (YYYY-MM-DD)"),
        dateTo: z
          .string()
          .optional()
          .describe("Fecha fin en formato ISO (YYYY-MM-DD)"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .default(20)
          .describe("Número máximo de resultados (1-50, por defecto 20)"),
      },
    },
    async (args) => {
      const marcaFilter = invoiceWhereMarca(args.marca);

      const invoices = await prisma.invoice.findMany({
        where: {
          holdedStatus: { not: -1 },
          ...(args.type ? { type: args.type } : {}),
          ...(args.status ? { status: args.status } : {}),
          ...(args.dateFrom || args.dateTo
            ? {
                date: {
                  ...(args.dateFrom ? { gte: new Date(args.dateFrom) } : {}),
                  ...(args.dateTo ? { lte: new Date(args.dateTo) } : {}),
                },
              }
            : {}),
          ...marcaFilter,
        },
        select: {
          id: true,
          holdedId: true,
          type: true,
          status: true,
          date: true,
          counterparty: true,
          total: true,
          totalEur: true,
          currency: true,
          marca: true,
          accountingMonth: true,
          paymentsTotal: true,
          paymentsPending: true,
          _count: { select: { lines: true } },
        },
        orderBy: { date: "desc" },
        take: args.limit ?? 20,
      });

      return {
        content: [{ type: "text", text: JSON.stringify(invoices, null, 2) }],
      };
    }
  );

  server.registerTool(
    "get_invoice_detail",
    {
      description:
        "Devuelve el detalle completo de una factura: líneas, clasificaciones y pagos registrados.",
      inputSchema: {
        invoiceId: z.string().describe("ID de la factura (UUID interno)"),
      },
    },
    async (args) => {
      const invoice = await prisma.invoice.findUnique({
        where: { id: args.invoiceId },
        include: {
          lines: {
            include: {
              classification: {
                include: {
                  project: { select: { name: true, jiraKey: true } },
                },
              },
            },
          },
          erpPayments: {
            select: {
              id: true,
              amount: true,
              paidAt: true,
              paidBy: true,
              notes: true,
            },
          },
        },
      });

      if (!invoice) {
        return {
          content: [{ type: "text", text: `Invoice not found: ${args.invoiceId}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(invoice, null, 2) }],
      };
    }
  );

  server.registerTool(
    "search_invoices",
    {
      description:
        "Busca facturas por texto libre (nombre del proveedor/cliente o número de factura).",
      inputSchema: {
        query: z.string().min(1).describe("Texto a buscar"),
        marca: z
          .string()
          .optional()
          .describe("Filtrar adicionalmente por marca"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .default(10)
          .describe("Máximo de resultados (por defecto 10)"),
      },
    },
    async (args) => {
      const marcaFilter = invoiceWhereMarca(args.marca);
      const q = args.query.trim();

      const invoices = await prisma.invoice.findMany({
        where: {
          holdedStatus: { not: -1 },
          OR: [
            { counterparty: { contains: q, mode: "insensitive" } },
            { number: { contains: q, mode: "insensitive" } },
          ],
          ...marcaFilter,
        },
        select: {
          id: true,
          holdedId: true,
          number: true,
          type: true,
          date: true,
          counterparty: true,
          totalEur: true,
          marca: true,
          status: true,
        },
        orderBy: { date: "desc" },
        take: args.limit ?? 10,
      });

      return {
        content: [{ type: "text", text: JSON.stringify(invoices, null, 2) }],
      };
    }
  );
}
