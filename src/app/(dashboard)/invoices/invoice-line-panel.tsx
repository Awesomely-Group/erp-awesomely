import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { HoldedClient } from "@/lib/holded";
import { formatCurrency, formatDate, holdedInvoiceUrl } from "@/lib/utils";

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

const LINE_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-red-50 text-red-600",
  CLASSIFIED: "bg-blue-50 text-blue-600",
  REVIEWED: "bg-purple-50 text-purple-600",
  APPROVED: "bg-green-50 text-green-600",
};

const LINE_STATUS_LABELS: Record<string, string> = {
  PENDING: "Sin clasificar",
  CLASSIFIED: "Clasificado",
  REVIEWED: "Revisado",
  APPROVED: "Aprobado",
};

export async function InvoiceLinePanel({
  invoiceId,
}: {
  invoiceId: string;
}): Promise<React.JSX.Element> {
  const [invoice, companies] = await Promise.all([
    prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        company: true,
        lines: {
          orderBy: { sortOrder: "asc" },
          include: { classification: true },
        },
      },
    }),
    prisma.company.findMany({ where: { active: true }, select: { holdedApiKey: true } }),
  ]);

  if (!invoice) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 text-sm text-gray-400">
        Factura no encontrada.
      </div>
    );
  }

  // Resolve account names from Holded
  const holdedById = new Map<string, string>();
  const holdedByNum = new Map<string, string>();

  await Promise.all(
    companies.map(async (c) => {
      const maps = await new HoldedClient(c.holdedApiKey).getAccountMaps();
      for (const [k, v] of maps.byId) holdedById.set(k, v.name);
      for (const [k, v] of maps.byNum) holdedByNum.set(k, v);
    })
  );

  function resolveAccountName(line: { accountingAccount: string | null; accountingAccountName: string | null }): string | null {
    const key = line.accountingAccount;
    if (!key) return null;
    return line.accountingAccountName ?? holdedById.get(key) ?? holdedByNum.get(key) ?? null;
  }

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
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex-shrink-0 transition-colors"
          >
            Ver detalle →
          </Link>
        </div>
        <div className="text-xs text-gray-500 space-y-0.5">
          <p className="truncate">{invoice.counterparty ?? "—"} · {invoice.company.name}</p>
          <p className="flex items-center justify-between">
            <span>{formatDate(invoice.date)}</span>
            <span className="font-semibold text-gray-700">{formatCurrency(Number(invoice.totalEur))}</span>
          </p>
        </div>
      </div>

      {/* Lines */}
      <div className="overflow-y-auto flex-1">
        {invoice.lines.length === 0 ? (
          <p className="p-4 text-sm text-gray-400">Sin líneas.</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-50 z-10">
              <tr className="border-b border-gray-100">
                <th className="px-3 py-2 text-left font-medium text-gray-500">Descripción</th>
                <th className="px-3 py-2 text-right font-medium text-gray-500 whitespace-nowrap">Total EUR</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap">Cta. contable</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500">Estado</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line) => {
                const accountName = resolveAccountName(line);
                const classStatus = line.classification?.status ?? "PENDING";
                return (
                  <tr key={line.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-3 py-2 max-w-[160px]">
                      <p className="font-medium text-gray-800 truncate" title={line.name}>{line.name}</p>
                      {line.description && (
                        <p className="text-gray-400 truncate" title={line.description ?? undefined}>{line.description}</p>
                      )}
                      <p className="text-gray-400 mt-0.5">
                        {Number(line.quantity)} × {formatCurrency(Number(line.unitPrice))}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-gray-700 whitespace-nowrap">
                      {formatCurrency(Number(line.totalEur))}
                    </td>
                    <td className="px-3 py-2 text-gray-500 max-w-[120px]">
                      {accountName ? (
                        <span className="truncate block" title={accountName}>{accountName}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${LINE_STATUS_COLORS[classStatus] ?? ""}`}>
                        {LINE_STATUS_LABELS[classStatus] ?? classStatus}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
