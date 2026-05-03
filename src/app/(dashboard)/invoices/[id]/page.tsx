import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate, holdedInvoiceUrl } from "@/lib/utils";
import { notFound } from "next/navigation";
import { ClassifyLinesForm } from "./classify-lines-form";
import { MarcaEditor } from "./marca-editor";
import { getSuggestionsForLine } from "@/lib/suggestions";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.JSX.Element> {
  const { id } = await params;

  const invoice = await prisma.invoice.findUnique({
    where: { id },
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
  });

  if (!invoice) notFound();

  const projects = await prisma.jiraProject.findMany({
    where: { active: true },
    include: { workspace: true },
    orderBy: { name: "asc" },
  });

  // Fetch suggestions for unclassified lines
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
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            Factura {invoice.number ?? invoice.holdedId.slice(0, 8)}
            <a
              href={holdedInvoiceUrl(invoice.holdedId, invoice.type)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-normal text-gray-400 hover:text-indigo-600 transition-colors"
              title="Ver en Holded"
            >
              Ver en Holded ↗
            </a>
          </h1>
          <p className="text-sm text-gray-500 mt-1 flex items-center gap-1 flex-wrap">
            {invoice.type === "SALE" ? "Venta" : "Compra"} ·{" "}
            {invoice.company.name} ·{" "}
            <MarcaEditor invoiceId={invoice.id} marca={invoice.marca} />
            {" · "}
            {formatDate(invoice.date)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-gray-900">
            {formatCurrency(Number(invoice.totalEur))}
          </p>
          {invoice.currency !== "EUR" && (
            <p className="text-sm text-gray-500">
              {formatCurrency(Number(invoice.total), invoice.currency)} · TC:{" "}
              {Number(invoice.fxRateToEur).toFixed(4)}
            </p>
          )}
        </div>
      </div>

      {/* Meta */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <p className="text-gray-500">Contraparte</p>
          <p className="font-medium mt-0.5">{invoice.counterparty ?? "—"}</p>
        </div>
        <div>
          <p className="text-gray-500">Vencimiento</p>
          <p className="font-medium mt-0.5">
            {invoice.dueDate ? formatDate(invoice.dueDate) : "—"}
          </p>
        </div>
        <div>
          <p className="text-gray-500">Moneda</p>
          <p className="font-medium mt-0.5">{invoice.currency}</p>
        </div>
        <div>
          <p className="text-gray-500">Clasificación</p>
          <p className="font-medium mt-0.5">
            {classifiedCount} / {invoice.lines.length} líneas
          </p>
        </div>
      </div>

      {/* Lines */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">
          Líneas de factura
        </h2>
        <ClassifyLinesForm
          invoiceId={invoice.id}
          invoiceMarca={invoice.marca}
          lines={invoice.lines.map((l) => ({
            id: l.id,
            name: l.name,
            accountingAccount: l.accountingAccount,
            accountingAccountName: l.accountingAccountName,
            description: l.description,
            notes: l.notes,
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
