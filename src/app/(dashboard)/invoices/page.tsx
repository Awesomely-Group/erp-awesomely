import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/utils";
import Link from "next/link";
import { InvoiceStatus, InvoiceType } from "@prisma/client";

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  PENDING: "Sin clasificar",
  PARTIAL: "Parcial",
  CLASSIFIED: "Clasificado",
  REVIEWED: "Revisado",
  APPROVED: "Aprobado",
};

const STATUS_COLORS: Record<InvoiceStatus, string> = {
  PENDING: "bg-red-100 text-red-700",
  PARTIAL: "bg-amber-100 text-amber-700",
  CLASSIFIED: "bg-blue-100 text-blue-700",
  REVIEWED: "bg-purple-100 text-purple-700",
  APPROVED: "bg-green-100 text-green-700",
};

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string; company?: string; page?: string }>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const page = parseInt(params.page ?? "1", 10);
  const pageSize = 50;

  const where = {
    ...(params.status ? { status: params.status as InvoiceStatus } : {}),
    ...(params.type ? { type: params.type as InvoiceType } : {}),
    ...(params.company ? { companyId: params.company } : {}),
  };

  const [invoices, total, companies] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: { company: true, _count: { select: { lines: true } } },
      orderBy: { date: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.invoice.count({ where }),
    prisma.company.findMany({ where: { active: true } }),
  ]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Facturas</h1>
          <p className="text-sm text-gray-500 mt-1">{total} facturas en total</p>
        </div>
      </div>

      {/* Filters */}
      <form className="flex flex-wrap gap-3">
        <select
          name="status"
          defaultValue={params.status ?? ""}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
        >
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select
          name="type"
          defaultValue={params.type ?? ""}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
        >
          <option value="">Compra y venta</option>
          <option value="SALE">Venta</option>
          <option value="PURCHASE">Compra</option>
        </select>
        <select
          name="company"
          defaultValue={params.company ?? ""}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
        >
          <option value="">Todas las empresas</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          Filtrar
        </button>
      </form>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-3 text-left font-medium text-gray-600">Número</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Tipo</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Empresa</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Contraparte</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Fecha</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">Total (EUR)</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Estado</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Líneas</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr
                key={inv.id}
                className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/invoices/${inv.id}`}
                    className="font-medium text-indigo-600 hover:text-indigo-800"
                  >
                    {inv.number ?? inv.holdedId.slice(0, 8)}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {inv.type === "SALE" ? "Venta" : "Compra"}
                </td>
                <td className="px-4 py-3 text-gray-600">{inv.company.name}</td>
                <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">
                  {inv.counterparty ?? "—"}
                </td>
                <td className="px-4 py-3 text-gray-600">{formatDate(inv.date)}</td>
                <td className="px-4 py-3 text-right font-medium">
                  {formatCurrency(Number(inv.totalEur))}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[inv.status]}`}>
                    {STATUS_LABELS[inv.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">{inv._count.lines}</td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                  No hay facturas con estos filtros
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {page > 1 && (
            <Link
              href={`/invoices?${new URLSearchParams({ ...params, page: String(page - 1) })}`}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              Anterior
            </Link>
          )}
          <span className="text-sm text-gray-600">
            Página {page} de {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`/invoices?${new URLSearchParams({ ...params, page: String(page + 1) })}`}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              Siguiente
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
