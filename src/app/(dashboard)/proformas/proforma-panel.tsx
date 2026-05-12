import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate, holdedProformaUrl } from "@/lib/utils";
import { ProformaClassifyForm } from "./proforma-classify-form";

const STATUS_LABELS: Record<number, string> = {
  [-1]: "Cancelada",
  [0]: "Borrador",
  [1]: "Enviada",
  [2]: "Aceptada",
};

const STATUS_COLORS: Record<number, string> = {
  [-1]: "bg-red-100 text-red-700",
  [0]: "bg-gray-100 text-gray-600",
  [1]: "bg-yellow-100 text-yellow-700",
  [2]: "bg-green-100 text-green-700",
};

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
      },
    }),
    prisma.jiraProject.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!proforma) {
    return (
      <div className="text-sm text-gray-400">Proforma no encontrada.</div>
    );
  }

  const status = proforma.holdedStatus ?? 0;
  const statusLabel = STATUS_LABELS[status] ?? `Estado ${status}`;
  const statusColor = STATUS_COLORS[status] ?? "bg-gray-100 text-gray-600";

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

      {/* Classification form */}
      <ProformaClassifyForm
        proformaId={proforma.id}
        initialMarca={proforma.marca}
        initialProjectId={proforma.projectId}
        initialNotes={proforma.notes}
        projects={projects}
      />
    </div>
  );
}
