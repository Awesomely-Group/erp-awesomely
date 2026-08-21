import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate, holdedProformaUrl } from "@/lib/utils";
import { getProformaStatusInfo } from "@/lib/proforma-status";
import { ProformaClassifyForm } from "./proforma-classify-form";
import { ProformaInvoiceLinkForm } from "./proforma-invoice-link-form";

export async function ProformaPanel({
  proformaId,
}: {
  proformaId: string;
}): Promise<React.JSX.Element> {
  const [proforma, projects] = await Promise.all([
    prisma.proforma.findUnique({
      where: { id: proformaId },
      select: {
        id: true,
        holdedId: true,
        companyId: true,
        holdedContactId: true,
        number: true,
        counterparty: true,
        description: true,
        tags: true,
        date: true,
        dueDate: true,
        holdedStatus: true,
        currency: true,
        subtotal: true,
        totalEur: true,
        marca: true,
        projectId: true,
        notes: true,
        invoiceId: true,
        invoiceLinkConfidence: true,
        invoice: {
          select: {
            id: true,
            number: true,
            counterparty: true,
            date: true,
            totalEur: true,
            paymentsPending: true,
          },
        },
      },
    }),
    prisma.jiraProject.findMany({
      where: { active: true },
      select: { id: true, name: true, workspace: { select: { name: true } } },
      orderBy: { name: "asc" },
    }).then((ps) => ps.map((p) => ({ id: p.id, name: p.name, workspaceName: p.workspace.name }))),
  ]);

  if (!proforma) {
    return (
      <div className="text-sm text-gray-400">Proforma no encontrada.</div>
    );
  }

  const { label: statusLabel, badgeClass: statusColor } = getProformaStatusInfo(proforma.holdedStatus);
  const isInvoicePaid = proforma.invoice ? Number(proforma.invoice.paymentsPending) <= 0 : false;

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="pb-4 border-b border-gray-100">
        <div className="flex items-center gap-2 mb-2">
          <span className="font-semibold text-gray-900">
            {proforma.number ?? (
              <span className="italic text-gray-400 font-normal">Borrador</span>
            )}
          </span>
          <a
            href={holdedProformaUrl(proforma.holdedId)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-400 hover:text-indigo-600 transition-colors"
            title="Ver en Holded"
          >
            ↗
          </a>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor}`}>
            {statusLabel}
          </span>
        </div>

        <div className="space-y-1">
          <p className="font-medium text-gray-800 truncate">
            {proforma.counterparty ?? "—"}
          </p>
          {proforma.description && (
            <p className="text-xs text-gray-500 truncate">{proforma.description}</p>
          )}
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>
              {formatDate(proforma.date.toISOString())}
              {proforma.dueDate && (
                <> · Vence {formatDate(proforma.dueDate.toISOString())}</>
              )}
            </span>
            <span className="font-semibold text-gray-700 ml-2">
              {formatCurrency(Number(proforma.totalEur))}
            </span>
          </div>
          {proforma.currency !== "EUR" && (
            <p className="text-xs text-gray-400">
              {proforma.currency} {formatCurrency(Number(proforma.subtotal))} (importe original)
            </p>
          )}
          {proforma.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {proforma.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-violet-100 text-violet-700"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Linked invoice */}
      {proforma.invoice && (
        <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Factura
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                isInvoicePaid ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"
              }`}
            >
              {isInvoicePaid ? "Pagada" : "Pendiente"}
            </span>
          </div>
          <p className="text-sm text-gray-800">
            {proforma.invoice.number ?? "(sin nº)"} · {formatDate(proforma.invoice.date.toISOString())}
          </p>
          <p className="text-sm font-semibold text-gray-700">
            {formatCurrency(Number(proforma.invoice.totalEur))}
          </p>
          {proforma.invoiceLinkConfidence && (
            <p className="text-xs text-gray-400">
              Vínculo: {proforma.invoiceLinkConfidence === "holded_link"
                ? "confirmado por Holded"
                : proforma.invoiceLinkConfidence === "manual"
                  ? "vinculado manualmente"
                  : "estimado por importe/fecha"}
            </p>
          )}
        </div>
      )}

      {/* Classification form */}
      <ProformaClassifyForm
        proformaId={proforma.id}
        initialMarca={proforma.marca}
        initialProjectId={proforma.projectId}
        initialNotes={proforma.notes}
        projects={projects}
      />

      {/* Manual invoice link */}
      <ProformaInvoiceLinkForm
        proformaId={proforma.id}
        companyId={proforma.companyId}
        contactId={proforma.holdedContactId}
        initialInvoiceId={proforma.invoiceId}
      />
    </div>
  );
}
