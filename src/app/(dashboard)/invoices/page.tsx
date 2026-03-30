import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate, holdedInvoiceUrl } from "@/lib/utils";
import Link from "next/link";
import { InvoiceStatus, InvoiceType } from "@prisma/client";
import { InvoicesFilters } from "./invoices-filters";
import { Suspense } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { ClickableRow } from "@/components/clickable-row";

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

const VALID_SORT_KEYS = ["date", "totalEur", "status", "counterparty"] as const;
type SortKey = (typeof VALID_SORT_KEYS)[number];
type SortDir = "asc" | "desc";

function parseSortKey(v: string | undefined): SortKey {
  return VALID_SORT_KEYS.includes(v as SortKey) ? (v as SortKey) : "date";
}
function parseSortDir(v: string | undefined): SortDir {
  return v === "asc" ? "asc" : "desc";
}

function getDateRange(
  period: string,
  dateFrom?: string,
  dateTo?: string
): { gte?: Date; lte?: Date } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const q = Math.floor(m / 3);

  switch (period) {
    case "this_month":
      return { gte: new Date(y, m, 1), lte: new Date(y, m + 1, 0, 23, 59, 59) };
    case "last_month":
      return { gte: new Date(y, m - 1, 1), lte: new Date(y, m, 0, 23, 59, 59) };
    case "this_quarter":
      return { gte: new Date(y, q * 3, 1), lte: new Date(y, q * 3 + 3, 0, 23, 59, 59) };
    case "last_quarter": {
      const lq = q === 0 ? 3 : q - 1;
      const lqy = q === 0 ? y - 1 : y;
      return { gte: new Date(lqy, lq * 3, 1), lte: new Date(lqy, lq * 3 + 3, 0, 23, 59, 59) };
    }
    case "this_year":
      return { gte: new Date(y, 0, 1), lte: new Date(y, 11, 31, 23, 59, 59) };
    case "last_year":
      return { gte: new Date(y - 1, 0, 1), lte: new Date(y - 1, 11, 31, 23, 59, 59) };
    case "custom":
      return {
        gte: dateFrom ? new Date(dateFrom) : undefined,
        lte: dateTo ? new Date(dateTo + "T23:59:59") : undefined,
      };
    default:
      return {};
  }
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    status?: string;
    type?: string;
    company?: string;
    period?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: string;
    sortBy?: string;
    sortDir?: string;
  }>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const pageSize = 50;
  const sortBy = parseSortKey(params.sortBy);
  const sortDir = parseSortDir(params.sortDir);

  const dateRange = getDateRange(params.period ?? "", params.dateFrom, params.dateTo);

  const where = {
    ...(params.search
      ? {
          OR: [
            { number: { contains: params.search, mode: "insensitive" as const } },
            { counterparty: { contains: params.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(params.status ? { status: params.status as InvoiceStatus } : {}),
    ...(params.type ? { type: params.type as InvoiceType } : {}),
    ...(params.company ? { companyId: params.company } : {}),
    ...(dateRange.gte || dateRange.lte ? { date: dateRange } : {}),
  };

  const orderBy =
    sortBy === "totalEur"
      ? { totalEur: sortDir }
      : sortBy === "status"
      ? { status: sortDir }
      : sortBy === "counterparty"
      ? { counterparty: sortDir }
      : { date: sortDir };

  const [invoices, total, companies] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: { company: true, _count: { select: { lines: true } } },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.invoice.count({ where }),
    prisma.company.findMany({ where: { active: true } }),
  ]);

  const totalPages = Math.ceil(total / pageSize);

  function buildUrl(overrides: Record<string, string | undefined>): string {
    const sp = new URLSearchParams();
    const merged = {
      search: params.search,
      status: params.status,
      type: params.type,
      company: params.company,
      period: params.period,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      sortBy: params.sortBy,
      sortDir: params.sortDir,
      page: params.page,
      ...overrides,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v) sp.set(k, v);
    }
    return `/invoices?${sp.toString()}`;
  }

  function pageUrl(p: number): string {
    return buildUrl({ page: String(p) });
  }

  function sortUrl(col: SortKey): string {
    const nextDir =
      sortBy === col ? (sortDir === "asc" ? "desc" : "asc") : "desc";
    return buildUrl({ sortBy: col, sortDir: nextDir, page: "1" });
  }

  function SortTh({
    col,
    label,
    align = "left",
  }: {
    col: SortKey;
    label: string;
    align?: "left" | "right" | "center";
  }): React.JSX.Element {
    const active = sortBy === col;
    const Icon = active
      ? sortDir === "asc"
        ? ChevronUp
        : ChevronDown
      : ChevronsUpDown;
    return (
      <th className={`px-4 py-3 text-${align} font-medium text-gray-600`}>
        <Link
          href={sortUrl(col)}
          className="inline-flex items-center gap-1 hover:text-gray-900"
        >
          {label}
          <Icon className={`h-3.5 w-3.5 ${active ? "text-indigo-600" : "text-gray-300"}`} />
        </Link>
      </th>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Facturas</h1>
          <p className="text-sm text-gray-500 mt-1">
            {total.toLocaleString("es-ES")} facturas
            {totalPages > 1 && ` · página ${page} de ${totalPages}`}
          </p>
        </div>
      </div>

      <Suspense>
        <InvoicesFilters companies={companies} />
      </Suspense>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-3 text-left font-medium text-gray-600">Número</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Tipo</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Empresa</th>
              <SortTh col="counterparty" label="Contraparte" />
              <SortTh col="date" label="Fecha" />
              <SortTh col="totalEur" label="Total (EUR)" align="right" />
              <SortTh col="status" label="Estado" />
              <th className="px-4 py-3 text-center font-medium text-gray-600">Líneas</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <ClickableRow
                key={inv.id}
                href={`/invoices/${inv.id}`}
                className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">
                      {inv.number ?? inv.holdedId.slice(0, 8)}
                    </span>
                    <a
                      href={holdedInvoiceUrl(inv.holdedId, inv.type)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-gray-400 hover:text-indigo-600 transition-colors"
                      title="Ver en Holded"
                    >
                      ↗
                    </a>
                  </div>
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
                <td className="px-4 py-3 text-center text-gray-500">{inv._count.lines}</td>
              </ClickableRow>
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
        <div className="flex items-center justify-center gap-1">
          <Link
            href={pageUrl(1)}
            className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${page === 1 ? "border-gray-200 text-gray-300 pointer-events-none" : "border-gray-300 hover:bg-gray-50"}`}
          >
            «
          </Link>
          <Link
            href={pageUrl(page - 1)}
            className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${page === 1 ? "border-gray-200 text-gray-300 pointer-events-none" : "border-gray-300 hover:bg-gray-50"}`}
          >
            Anterior
          </Link>

          {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
            let p: number;
            if (totalPages <= 7) {
              p = i + 1;
            } else if (page <= 4) {
              p = i + 1;
            } else if (page >= totalPages - 3) {
              p = totalPages - 6 + i;
            } else {
              p = page - 3 + i;
            }
            return (
              <Link
                key={p}
                href={pageUrl(p)}
                className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${p === page ? "border-indigo-600 bg-indigo-600 text-white" : "border-gray-300 hover:bg-gray-50"}`}
              >
                {p}
              </Link>
            );
          })}

          <Link
            href={pageUrl(page + 1)}
            className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${page === totalPages ? "border-gray-200 text-gray-300 pointer-events-none" : "border-gray-300 hover:bg-gray-50"}`}
          >
            Siguiente
          </Link>
          <Link
            href={pageUrl(totalPages)}
            className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${page === totalPages ? "border-gray-200 text-gray-300 pointer-events-none" : "border-gray-300 hover:bg-gray-50"}`}
          >
            »
          </Link>
        </div>
      )}
    </div>
  );
}
