import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate, holdedInvoiceUrl } from "@/lib/utils";
import { getSuggestionsForLine } from "@/lib/suggestions";
import { ClassifyLinesForm } from "./[id]/classify-lines-form";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Sin clasificar",
  PARTIAL: "Parcial",
  CLASSIFIED: "Clasificado",
  REVIEWED: "Revisado",
  APPROVED: "Aprobado",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-red-100 text-red-700",
  PARTIAL: "bg-amber-100 text-amber-700",
  CLASSIFIED: "bg-blue-100 text-blue-700",
  REVIEWED: "bg-purple-100 text-purple-700",
  APPROVED: "bg-green-100 text-green-700",
};

export async function InvoiceLinePanel({
  invoiceId,
}: {
  invoiceId: string;
}): Promise<React.JSX.Element> {
  const [invoice, projects] = await Promise.all([
    prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        company: true,
        lines: {
          orderBy: { sortOrder: "asc" },
          include: {
            classification: {
              include: { project: { include: { workspace: true } } },
            },
          },
        },
      },
    }),
    prisma.jiraProject.findMany({
      where: { active: true },
      include: { workspace: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!invoice) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 text-sm text-gray-400">
        Factura no encontrada.
      </div>
    );
  }

  // Fetch AI suggestions for unclassified lines
  const suggestionsMap = await Promise.all(
    invoice.lines
      .filter((l) => !l.classification)
      .map(async (line) => {
        const suggestions = await getSuggestionsForLine({
          counterparty: invoice.counterparty,
          lineName: line.name,
          lineDescription: line.description,
        });
        return [line.id, suggestions] as const;
      })
  ).then((entries) => new Map(entries));

  const classifiedCount = invoice.lines.filter((l) => l.classification).length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 flex flex-col max-h-[calc(100vh-8rem)] overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-gray-900 truncate">
              {invoice.number ?? invoice.holdedId.slice(0, 8)}
            </span>
            <a
              href={holdedInvoiceUrl(invoice.holdedId, invoice.type)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-400 hover:text-indigo-600 transition-colors flex-shrink-0"
              title="Ver en Holded"
            >
              ↗
            </a>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${STATUS_COLORS[invoice.status] ?? ""}`}
            >
              {STATUS_LABELS[invoice.status] ?? invoice.status}
            </span>
          </div>
          <Link
            href={`/invoices/${invoice.id}`}
            className="text-xs text-gray-400 hover:text-indigo-600 font-medium flex-shrink-0 transition-colors"
          >
            ↗ detalle
          </Link>
        </div>
        <div className="text-xs text-gray-500 space-y-0.5">
          <p className="truncate">{invoice.counterparty ?? "—"} · {invoice.company.name}</p>
          <p className="flex items-center justify-between">
            <span>{formatDate(invoice.date)} · {classifiedCount}/{invoice.lines.length} líneas</span>
            <span className="font-semibold text-gray-700">{formatCurrency(Number(invoice.totalEur))}</span>
          </p>
        </div>
      </div>

      {/* Classification form */}
      <div className="overflow-y-auto flex-1 p-3">
        <ClassifyLinesForm
          invoiceId={invoice.id}
          invoiceMarca={invoice.marca}
          lines={invoice.lines.map((l) => ({
            id: l.id,
            name: l.name,
            description: l.description,
            quantity: Number(l.quantity),
            unitPrice: Number(l.unitPrice),
            subtotal: Number(l.subtotal),
            tax: Number(l.tax),
            total: Number(l.total),
            totalEur: Number(l.totalEur),
            currency: invoice.currency,
            classification: l.classification
              ? {
                  id: l.classification.id,
                  status: l.classification.status,
                  projectId: l.classification.projectId,
                  projectName: l.classification.project.name,
                  workspaceName: l.classification.project.workspace.name,
                  notes: l.classification.notes,
                }
              : null,
            suggestions: suggestionsMap.get(l.id) ?? [],
          }))}
          projects={projects.map((p) => ({
            id: p.id,
            name: p.name,
            key: p.jiraKey,
            workspaceName: p.workspace.name,
          }))}
        />
      </div>
    </div>
  );
}
