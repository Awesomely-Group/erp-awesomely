import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/prisma";
import { invoiceWhereMarca } from "@/lib/org";
import type { ApiContext } from "@/lib/api/v1";
import { companyWhere, marcaWhere, narrowCompany } from "../shared";

export function registerInvoiceTools(server: McpServer, ctx: ApiContext): void {
  server.registerTool(
    "list_invoices",
    {
      description:
        "Lista facturas con filtros opcionales. Devuelve un máximo de 500 resultados ordenados por fecha descendente.",
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
          .max(500)
          .optional()
          .default(50)
          .describe("Número máximo de resultados (1-500, por defecto 50)"),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .default(0)
          .describe("Número de resultados a saltar para paginación"),
        companyId: z.string().optional().describe("Filtrar por ID de empresa"),
      },
    },
    async (args) => {
      const marcaFilter = invoiceWhereMarca(args.marca);

      const where = {
        holdedStatus: { not: -1 },
        // Una factura borrada en Holded no debe reaparecer por MCP. La ruta REST ya lo
        // filtraba y esta herramienta no: dos puertas al mismo dato con reglas distintas.
        removedFromHoldedAt: null,
        // La frontera de la credencial, que no viene del modelo.
        ...companyWhere(ctx),
        ...marcaWhere(ctx),
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
        ...(narrowCompany(ctx, args.companyId) === undefined
          ? {}
          : { companyId: narrowCompany(ctx, args.companyId) }),
        ...marcaFilter,
      };

      const total = await prisma.invoice.count({ where });

      const invoices = await prisma.invoice.findMany({
        where,
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
          lines: {
            select: {
              classification: {
                select: {
                  projectId: true,
                  project: { select: { id: true, name: true } },
                  status: true,
                },
              },
            },
          },
        },
        orderBy: { date: "desc" },
        skip: args.offset ?? 0,
        take: args.limit ?? 50,
      });

      const result = {
        invoices: invoices.map((invoice) => ({
          ...invoice,
          projectIds: invoice.lines
            .map((l) => l.classification?.projectId)
            .filter((id): id is string => id != null),
          hasProjectLines: invoice.lines.some(
            (l) => l.classification?.projectId != null
          ),
          isStructureCost:
            invoice.type === "PURCHASE" &&
            invoice.lines.every((l) => l.classification?.projectId == null),
        })),
        pagination: {
          total,
          limit: args.limit ?? 50,
          offset: args.offset ?? 0,
          hasMore:
            (args.offset ?? 0) + invoices.length < total,
        },
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
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
      // `findFirst` y no `findUnique`: hace falta meter la frontera de la credencial en
      // el `where`, o una clave acotada a una sociedad podría leer por id la factura de
      // la otra. Fuera de alcance responde "no existe", igual que una que no existe.
      const invoice = await prisma.invoice.findFirst({
        where: { id: args.invoiceId, ...companyWhere(ctx), ...marcaWhere(ctx) },
        include: {
          lines: {
            include: {
              classification: {
                select: {
                  id: true,
                  projectId: true,
                  project: { select: { id: true, name: true } },
                  budgetId: true,
                  budget: { select: { id: true, name: true } },
                  status: true,
                  marca: true,
                  classifiedAt: true,
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
        companyId: z.string().optional().describe("Filtrar por ID de empresa"),
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
          removedFromHoldedAt: null,
          ...companyWhere(ctx),
          ...marcaWhere(ctx),
          OR: [
            { counterparty: { contains: q, mode: "insensitive" } },
            { number: { contains: q, mode: "insensitive" } },
          ],
          ...(narrowCompany(ctx, args.companyId) === undefined
          ? {}
          : { companyId: narrowCompany(ctx, args.companyId) }),
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
