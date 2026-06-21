import { prisma } from "@/lib/prisma";
import { getDateRange } from "@/lib/date-range";
import { invoiceWhereMarca, STATUS_FILTER_UNASSIGNED } from "@/lib/org";
import Link from "next/link";
import { InvoiceRecurrence, InvoiceStatus, InvoiceType, Prisma } from "@prisma/client";
import { InvoicesFilters } from "./invoices-filters";
import { InvoicesTable } from "./invoices-table";
import { InvoiceLinePanel } from "./invoice-line-panel";
import { InvoiceDrawer } from "./invoice-drawer";
import { Suspense } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { parseVisibleCols, type ColumnKey } from "./columns";


const VALID_SORT_KEYS = ["date", "totalEur", "status", "counterparty", "number", "companyName", "accountingMonth", "holdedStatus"] as const;
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

type HoldedPresence = "active" | "all" | "removed";

type InvoicePageParams = {
  search?: string;
  status?: string;
  type?: string;
  marca?: string;
  project?: string;
  period?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: string;
  sortBy?: string;
  sortDir?: string;
  invoiceId?: string;
  holdedPresence?: string;
  recurrence?: string;
  cols?: string;
  holdedStatus?: string;
};

function parseHoldedPresence(v: string | undefined): HoldedPresence {
  if (v === "all" || v === "removed") return v;
  return "active";
}


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

  const activeType: InvoiceType =
    params.type === "PURCHASE" ? InvoiceType.PURCHASE : InvoiceType.SALE;

  const holdedPresence = parseHoldedPresence(params.holdedPresence);
  const holdedPresenceWhere: Prisma.InvoiceWhereInput =
    holdedPresence === "active" ? { removedFromHoldedAt: null }
    : holdedPresence === "removed" ? { removedFromHoldedAt: { not: null } }
    : {};

  const andConditions: Prisma.InvoiceWhereInput[] = [];
  if (holdedPresence !== "all") andConditions.push(holdedPresenceWhere);
  if (params.search) {
    andConditions.push({ OR: [
      { number: { contains: params.search, mode: "insensitive" } },
      { counterparty: { contains: params.search, mode: "insensitive" } },
    ]});
  }
  if (Object.keys(statusWhere).length > 0) andConditions.push(statusWhere);
  if (marcaFilter) andConditions.push(marcaFilter);
  if (params.recurrence === "none") {
    andConditions.push({ recurrence: null });
  } else if (params.recurrence) {
    andConditions.push({ recurrence: params.recurrence as InvoiceRecurrence });
  }
  if (params.holdedStatus) {
    andConditions.push({ holdedStatus: parseInt(params.holdedStatus, 10) });
  }
  if (params.project) andConditions.push({ lines: { some: { classification: { projectId: params.project } } } });
  if (dateRange.gte || dateRange.lte) andConditions.push({ date: dateRange });

  const baseWhere: Prisma.InvoiceWhereInput = andConditions.length > 0 ? { AND: andConditions } : {};

  const where = { ...baseWhere, type: activeType };

  const orderBy: Prisma.InvoiceOrderByWithRelationInput =
    sortBy === "totalEur" ? { totalEur: sortDir }
    : sortBy === "status" ? { status: sortDir }
    : sortBy === "counterparty" ? { counterparty: sortDir }
    : sortBy === "number" ? { number: sortDir }
    : sortBy === "companyName" ? { company: { name: sortDir } }
    : sortBy === "accountingMonth" ? { accountingMonth: sortDir }
    : sortBy === "holdedStatus" ? { holdedStatus: sortDir }
    : { date: sortDir };

  const [invoices, total, saleCount, purchaseCount] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: {
        company: true,
      },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.invoice.count({ where }),
    prisma.invoice.count({ where: { ...baseWhere, type: InvoiceType.SALE } }),
    prisma.invoice.count({ where: { ...baseWhere, type: InvoiceType.PURCHASE } }),
  ]);

  const totalPages = Math.ceil(total / pageSize);

  return {
    searchParams: params,
    page,
    pageSize,
    sortBy,
    sortDir,
    activeType,
    invoices,
    total,
    totalPages,
    saleCount,
    purchaseCount,
  };
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<InvoicePageParams>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const activeProjects = await prisma.jiraProject.findMany({
    where: { active: true },
    select: { id: true, jiraKey: true, name: true, workspace: { select: { name: true } } },
    orderBy: { name: "asc" },
  }).catch(() => []);
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
    activeType,
    invoices,
    total,
    totalPages,
    saleCount,
    purchaseCount,
  } = data;

  const visibleCols = parseVisibleCols(params.cols);

  function buildUrl(overrides: Record<string, string | undefined>): string {
    const sp = new URLSearchParams();
    const merged = {
      search: q.search,
      status: q.status,
      type: q.type,
      marca: q.marca,
      project: q.project,
      period: q.period,
      dateFrom: q.dateFrom,
      dateTo: q.dateTo,
      sortBy: q.sortBy,
      sortDir: q.sortDir,
      page: q.page,
      invoiceId: q.invoiceId,
      holdedPresence: q.holdedPresence,
      recurrence: q.recurrence,
      cols: q.cols,
      holdedStatus: q.holdedStatus,
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

  const tableSection = (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            {/* Always visible */}
            <th className="w-8 px-4 py-3" />
            <SortTh col="number" label="Número" sortBy={sortBy} sortDir={sortDir} href={sortUrl("number")} />
            {/* Optional */}
            {visibleCols.has("companyName") && (
              <SortTh col="companyName" label="Entidad Legal" sortBy={sortBy} sortDir={sortDir} href={sortUrl("companyName")} />
            )}
            {visibleCols.has("brand") && (
              <th className="px-4 py-3 text-left font-medium text-gray-600">Marca</th>
            )}
            {/* Always visible */}
            <SortTh col="counterparty" label="Contraparte" sortBy={sortBy} sortDir={sortDir} href={sortUrl("counterparty")} />
            {/* Optional */}
            {visibleCols.has("accountingMonth") && (
              <SortTh col="accountingMonth" label="Mes Referencia" sortBy={sortBy} sortDir={sortDir} href={sortUrl("accountingMonth")} />
            )}
            {visibleCols.has("date") && (
              <SortTh col="date" label="Fecha" sortBy={sortBy} sortDir={sortDir} href={sortUrl("date")} />
            )}
            {visibleCols.has("subtotal") && (
              <th className="px-4 py-3 text-right font-medium text-gray-600">Base imp.</th>
            )}
            {visibleCols.has("total") && (
              <th className="px-4 py-3 text-right font-medium text-gray-600">Total</th>
            )}
            {visibleCols.has("totalEur") && (
              <SortTh col="totalEur" label="Total (EUR)" align="right" sortBy={sortBy} sortDir={sortDir} href={sortUrl("totalEur")} />
            )}
            {visibleCols.has("holdedStatus") && (
              <SortTh col="holdedStatus" label="Estado Holded" sortBy={sortBy} sortDir={sortDir} href={sortUrl("holdedStatus")} />
            )}
            {visibleCols.has("status") && (
              <SortTh col="status" label="Estado" sortBy={sortBy} sortDir={sortDir} href={sortUrl("status")} />
            )}
            {activeType === "PURCHASE" && visibleCols.has("recurrence") && (
              <th className="px-4 py-3 text-left font-medium text-gray-600">Recurrencia</th>
            )}
          </tr>
        </thead>
        <tbody>
          <InvoicesTable
            selectedId={params.invoiceId}
            projects={activeProjects.map((p) => ({ id: p.id, name: p.name, workspaceName: p.workspace.name }))}
            visibleCols={visibleCols}
            invoices={invoices.map((inv) => ({
              id: inv.id,
              holdedId: inv.holdedId,
              type: inv.type,
              number: inv.number,
              counterparty: inv.counterparty,
              date: inv.date.toISOString(),
              accountingMonth: (inv.accountingMonth ?? inv.date).toISOString(),
              currency: inv.currency,
              subtotal: Number(inv.subtotal),
              subtotalEur: Number(inv.subtotal) * Number(inv.fxRateToEur),
              total: Number(inv.total),
              totalEur: Number(inv.totalEur),
              holdedStatus: inv.holdedStatus ?? null,
              status: inv.status,
              companyName: inv.company.name,
              brand: inv.marca,
              recurrence: inv.recurrence ?? null,
              removedFromHoldedAt: inv.removedFromHoldedAt?.toISOString() ?? null,
            }))}
            invoiceType={activeType}
          />
        </tbody>
      </table>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Facturas</h1>
          <p className="text-sm text-gray-500 mt-1">
            {total.toLocaleString("es-ES")} facturas
            {totalPages > 1 && ` · página ${page} de ${totalPages}`}
          </p>
        </div>
        <div>
          <InvoicesFilters
            projects={activeProjects}
            visibleCols={[...visibleCols] as ColumnKey[]}
            invoiceType={activeType}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          <Link
            href={buildUrl({ type: "SALE", page: "1" })}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeType === "SALE"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Ventas
            <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">
              {saleCount.toLocaleString("es-ES")}
            </span>
          </Link>
          <Link
            href={buildUrl({ type: "PURCHASE", page: "1" })}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeType === "PURCHASE"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Compras
            <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
              {purchaseCount.toLocaleString("es-ES")}
            </span>
          </Link>
        </nav>
      </div>

      {tableSection}

      <InvoiceDrawer open={!!params.invoiceId}>
        {params.invoiceId && (
          <Suspense
            key={params.invoiceId}
            fallback={
              <div className="p-6 text-sm text-gray-400 animate-pulse">
                Cargando líneas…
              </div>
            }
          >
            <InvoiceLinePanel invoiceId={params.invoiceId} />
          </Suspense>
        )}
      </InvoiceDrawer>

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
