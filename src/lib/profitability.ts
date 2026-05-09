import { prisma } from "@/lib/prisma";
import { InvoiceType } from "@prisma/client";

export interface ProfitabilityInvoice {
  id: string;
  holdedId: string;
  type: "SALE" | "PURCHASE";
  number: string | null;
  counterparty: string | null;
  date: string;
  amount: number;
}

export interface ProfitabilityRow {
  projectId: string;
  projectName: string;
  workspaceName: string;
  revenue: number;
  costs: number;
  margin: number;
  marginPct: number;
  invoices: ProfitabilityInvoice[];
}

export async function getProfitabilityData(from: Date, to: Date): Promise<ProfitabilityRow[]> {
  const invoices = await prisma.invoice.findMany({
    where: {
      date: { gte: from, lte: to },
      status: { in: ["CLASSIFIED", "APPROVED"] },
    },
    include: {
      lines: {
        include: {
          classification: {
            include: { project: { include: { workspace: true } } },
          },
        },
      },
    },
  });

  const projectMap = new Map<
    string,
    {
      project: { name: string; workspaceName: string };
      revenue: number;
      costs: number;
      invoiceMap: Map<string, ProfitabilityInvoice>;
    }
  >();

  for (const invoice of invoices) {
    const classifiedLines = invoice.lines.filter((l) => l.classification !== null);
    if (classifiedLines.length === 0) continue;

    const classifiedSubtotalSum = classifiedLines.reduce(
      (sum, l) => sum + Number(l.subtotal),
      0
    );
    const invoiceTotal = Number(invoice.totalEur);

    for (const line of classifiedLines) {
      const classification = line.classification!;
      if (!classification.project && !classification.projectId) continue;

      const projectId = classification.projectId ?? "awesomely";

      const lineShare =
        classifiedSubtotalSum !== 0
          ? (Number(line.subtotal) / classifiedSubtotalSum) * invoiceTotal
          : invoiceTotal / classifiedLines.length;

      const existing = projectMap.get(projectId) ?? {
        project: {
          name: classification.project?.name ?? "Awesomely",
          workspaceName: classification.project?.workspace.name ?? "Awesomely",
        },
        revenue: 0,
        costs: 0,
        invoiceMap: new Map<string, ProfitabilityInvoice>(),
      };

      if (invoice.type === InvoiceType.SALE) {
        existing.revenue += lineShare;
      } else {
        existing.costs += lineShare;
      }

      const existingInv = existing.invoiceMap.get(invoice.id) ?? {
        id: invoice.id,
        holdedId: invoice.holdedId,
        type: invoice.type as "SALE" | "PURCHASE",
        number: invoice.number,
        counterparty: invoice.counterparty ?? null,
        date: invoice.date.toISOString(),
        amount: 0,
      };
      existingInv.amount += lineShare;
      existing.invoiceMap.set(invoice.id, existingInv);

      projectMap.set(projectId, existing);
    }
  }

  return Array.from(projectMap.entries())
    .map(([projectId, data]) => {
      const margin = data.revenue - data.costs;
      const marginPct = data.revenue > 0 ? (margin / data.revenue) * 100 : 0;
      return {
        projectId,
        projectName: data.project.name,
        workspaceName: data.project.workspaceName,
        revenue: data.revenue,
        costs: data.costs,
        margin,
        marginPct,
        invoices: Array.from(data.invoiceMap.values()).sort(
          (a, b) => Math.abs(b.amount) - Math.abs(a.amount)
        ),
      };
    })
    .sort((a, b) => b.margin - a.margin);
}

export async function getProjectProfitability(
  projectId: string,
  from: Date,
  to: Date
): Promise<ProfitabilityRow | null> {
  const invoices = await prisma.invoice.findMany({
    where: {
      date: { gte: from, lte: to },
      status: { in: ["CLASSIFIED", "APPROVED"] },
      lines: { some: { classification: { projectId } } },
    },
    include: {
      lines: {
        include: {
          classification: {
            include: { project: { include: { workspace: true } } },
          },
        },
      },
    },
  });

  let projectMeta: { name: string; workspaceName: string } | null = null;
  let revenue = 0;
  let costs = 0;
  const invoiceMap = new Map<string, ProfitabilityInvoice>();

  for (const invoice of invoices) {
    const classifiedLines = invoice.lines.filter(
      (l) => l.classification?.projectId === projectId
    );
    if (classifiedLines.length === 0) continue;

    const allClassifiedLines = invoice.lines.filter((l) => l.classification !== null);
    const classifiedSubtotalSum = allClassifiedLines.reduce(
      (sum, l) => sum + Number(l.subtotal),
      0
    );
    const invoiceTotal = Number(invoice.totalEur);

    for (const line of classifiedLines) {
      const classification = line.classification!;
      if (!projectMeta && classification.project) {
        projectMeta = {
          name: classification.project.name,
          workspaceName: classification.project.workspace.name,
        };
      }

      const lineShare =
        classifiedSubtotalSum !== 0
          ? (Number(line.subtotal) / classifiedSubtotalSum) * invoiceTotal
          : invoiceTotal / allClassifiedLines.length;

      if (invoice.type === InvoiceType.SALE) {
        revenue += lineShare;
      } else {
        costs += lineShare;
      }

      const existingInv = invoiceMap.get(invoice.id) ?? {
        id: invoice.id,
        holdedId: invoice.holdedId,
        type: invoice.type as "SALE" | "PURCHASE",
        number: invoice.number,
        counterparty: invoice.counterparty ?? null,
        date: invoice.date.toISOString(),
        amount: 0,
      };
      existingInv.amount += lineShare;
      invoiceMap.set(invoice.id, existingInv);
    }
  }

  if (!projectMeta) return null;

  const margin = revenue - costs;
  const marginPct = revenue > 0 ? (margin / revenue) * 100 : 0;

  return {
    projectId,
    projectName: projectMeta.name,
    workspaceName: projectMeta.workspaceName,
    revenue,
    costs,
    margin,
    marginPct,
    invoices: Array.from(invoiceMap.values()).sort(
      (a, b) => Math.abs(b.amount) - Math.abs(a.amount)
    ),
  };
}
