import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";
import { InvoiceType } from "@prisma/client";
import { format } from "date-fns";
import { ProfitabilityFilters } from "./profitability-filters";
import { ProfitabilityTable } from "./profitability-table";

interface ProfitabilityInvoice {
  id: string;
  holdedId: string;
  type: "SALE" | "PURCHASE";
  number: string | null;
  counterparty: string | null;
  date: string;
  amount: number;
}

interface ProfitabilityRow {
  projectId: string;
  projectName: string;
  workspaceName: string;
  revenue: number;
  costs: number;
  margin: number;
  marginPct: number;
  invoices: ProfitabilityInvoice[];
}

async function getProfitabilityData(from: Date, to: Date): Promise<ProfitabilityRow[]> {
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

export default async function ProfitabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; period?: string }>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  let from: Date;
  let to: Date;

  if (params.from && params.to) {
    from = new Date(params.from);
    to = new Date(params.to);
  } else if (params.period === "year") {
    from = new Date(currentYear, 0, 1);
    to = new Date(currentYear, 11, 31);
  } else {
    const q = Math.floor(currentMonth / 3);
    from = new Date(currentYear, q * 3, 1);
    to = new Date(currentYear, q * 3 + 3, 0);
  }

  const rows = await getProfitabilityData(from, to);

  const totals = rows.reduce(
    (acc, r) => ({
      revenue: acc.revenue + r.revenue,
      costs: acc.costs + r.costs,
      margin: acc.margin + r.margin,
    }),
    { revenue: 0, costs: 0, margin: 0 }
  );

  const periodLabel =
    params.period === "year"
      ? `Año ${currentYear}`
      : params.from
        ? `${params.from} — ${params.to}`
        : `Q${Math.floor(currentMonth / 3) + 1} ${currentYear}`;

  const fromStr = format(from, "yyyy-MM-dd");
  const toStr = format(to, "yyyy-MM-dd");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rentabilidad</h1>
          <p className="text-sm text-gray-500 mt-1">{periodLabel}</p>
        </div>
        <ProfitabilityFilters from={fromStr} to={toStr} />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500">Ingresos totales</p>
          <p className="text-2xl font-bold text-green-600 mt-1">
            {formatCurrency(totals.revenue)}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500">Gastos totales</p>
          <p className="text-2xl font-bold text-red-600 mt-1">
            {formatCurrency(totals.costs)}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500">Margen bruto</p>
          <p
            className={`text-2xl font-bold mt-1 ${
              totals.margin >= 0 ? "text-indigo-600" : "text-red-600"
            }`}
          >
            {formatCurrency(totals.margin)}
          </p>
          {totals.revenue > 0 && (
            <p className="text-sm text-gray-400 mt-0.5">
              {((totals.margin / totals.revenue) * 100).toFixed(1)}% sobre ingresos
            </p>
          )}
        </div>
      </div>

      <ProfitabilityTable rows={rows} />
    </div>
  );
}
