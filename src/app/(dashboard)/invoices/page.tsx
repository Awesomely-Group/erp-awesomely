import { prisma } from "@/lib/prisma";
import { getDateRange } from "@/lib/date-range";
import { invoiceWhereMarca, STATUS_FILTER_UNASSIGNED } from "@/lib/org";
import Link from "next/link";
import { InvoiceStatus, InvoiceType } from "@prisma/client";
import { InvoicesFilters } from "./invoices-filters";
import { InvoicesTable } from "./invoices-table";
import { Suspense } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";


const VALID_SORT_KEYS = ["date", "totalEur", "status", "counterparty"] as const;
type SortKey = (typeof VALID_SORT_KEYS)[number];
type SortDir = "asc" | "desc";

function parseSortKey(v: string | undefined): SortKey {
  return VALID_SORT_KEYS.includes(v as SortKey) ? (v as SortKey) : "date";
}
function parseSortDir(v: string | undefined): SortDir {
  return v === "asc" ? "asc" : "desc";
}

function sortThAlignClass(align: "left" | "right" | "center"): string {
  if (align === "right") return "text-right";
  if (align === "center") return "text-center";
  return "text-left";
}

function SortTh({
  col,
  label,
  align = "left",
  sortBy,
  sortDir,
  href,
}: {
  col: SortKey;
  label: string;
  align?: "left" | "right" | "center";
  sortBy: SortKey;
  sortDir: SortDir;
  href: string;
}): React.JSX.Element {
  const active = sortBy === col;
  const Icon = active
    ? sortDir === "asc"
      ? ChevronUp
      : ChevronDown
    : ChevronsUpDown;
  return (
    <th className={`px-4 py-3 ${sortThAlignClass(align)} font-medium text-gray-600`}>
      <Link
        href={href}
        className="inline-flex items-center gap-1 hover:text-gray-900"
      >
        {label}
        <Icon className={`h-3.5 w-3.5 ${active ? "text-indigo-600" : "text-gray-300"}`} />
      </Link>
    </th>
  );
}

type InvoicePageParams = {
  search?: string;
  status?: string;
  type?: string;
  marca?: string;
  period?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: string;
  sortBy?: string;
  sortDir?: string;
};

async function loadInvoicesPageData(params: InvoicePageParams) {
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const pageSize = 50;
  const sortBy = parseSortKey(params.sortBy);
  const sortDir = parseSortDir(params.sortDir);

  const dateRange = getDateRange(params.period ?? "", params.dateFrom, params.dateTo);

  const marcaFilter = invoiceWhereMarca(params.marca);

  const statusWhere =
    params.status === STATUS_FILTER_UNASSIGNED
      ? { status: { in: [InvoiceStatus.PENDING, InvoiceStatus.PARTIAL] } }
      : params.status
        ? { status: params.status as InvoiceStatus }
        : {};

  const where = {
    ...(params.search
      ? {
          OR: [
            { number: { contains: params.search, mode: "insensitive" as const } },
            { counterparty: { contains: params.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...statusWhere,
    ...(params.type ? { type: params.type as InvoiceType } : {}),
    ...(marcaFilter ?? {}),
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

  const [invoices, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: { company: true, _count: { select: { lines: true } } },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.invoice.count({ where }),
  ]);

  const totalPages = Math.ceil(total / pageSize);

  return {
    searchParams: params,
    page,
    pageSize,
    sortBy,
    sortDir,
    invoices,
    total,
    totalPages,
  };
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<InvoicePageParams>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  let data: Awaited<ReturnType<typeof loadInvoicesPageData>>;
  try {
    data = await loadInvoicesPageData(params);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : "";
    return (
      <div className="p-8 space-y-4">
        <h1 className="text-xl font-bold text-red-700">Error cargando facturas</h1>
        <pre className="text-sm bg-red-50 border border-red-200 rounded p-4 overflow-auto whitespace-pre-wrap">
          {msg}
          {"\n\n"}
          {stack}
        </pre>
      </div>
    );
  }

  const {
    searchParams: q,
    page,
    sortBy,
    sortDir,
    invoices,
    total,
    totalPages,
  } = data;

  function buildUrl(overrides: Record<string, string | undefined>): string {
    const sp = new URLSearchParams();
    const merged = {
      search: q.search,
      status: q.status,
      type: q.type,
      marca: q.marca,
      period: q.period,
      dateFrom: q.dateFrom,
      dateTo: q.dateTo,
      sortBy: q.sortBy,
      sortDir: q.sortDir,
      page: q.page,
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
        <InvoicesFilters />
      </Suspense>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-3 text-left font-medium text-gray-600">Número</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Tipo</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Entidad Legal</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Marca</th>
              <SortTh col="counterparty" label="Contraparte" sortBy={sortBy} sortDir={sortDir} href={sortUrl("counterparty")} />
              <SortTh col="date" label="Fecha" sortBy={sortBy} sortDir={sortDir} href={sortUrl("date")} />
              <SortTh col="totalEur" label="Total (EUR)" align="right" sortBy={sortBy} sortDir={sortDir} href={sortUrl("totalEur")} />
              <SortTh col="status" label="Estado" sortBy={sortBy} sortDir={sortDir} href={sortUrl("status")} />
              <th className="px-4 py-3 text-center font-medium text-gray-600">Líneas</th>
            </tr>
          </thead>
          <tbody>
            <InvoicesTable
              invoices={invoices.map((inv) => ({
                id: inv.id,
                holdedId: inv.holdedId,
                type: inv.type,
                number: inv.number,
                counterparty: inv.counterparty,
                date: inv.date.toISOString(),
                totalEur: Number(inv.totalEur),
                status: inv.status,
                companyName: inv.company.name,
                brand: inv.marca,
                lineCount: inv._count.lines,
              }))}
            />

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
