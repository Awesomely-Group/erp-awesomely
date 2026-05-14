import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { formatCurrency } from "@/lib/utils";
import { getDateRange } from "@/lib/date-range";
import { MARCA_FILTER_UNASSIGNED } from "@/lib/org";
import { ProformasFilters } from "./proformas-filters";
import { ProformasTable } from "./proformas-table";
import { ProformaDrawer } from "./proforma-drawer";
import { ProformaPanel } from "./proforma-panel";
import Link from "next/link";
import { ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";

type ProformaPageParams = {
  search?: string;
  period?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  marca?: string;
  project?: string;
  page?: string;
  alert?: string;
  proformaId?: string;
};

const PAGE_SIZE = 50;

function buildWhere(params: ProformaPageParams): Prisma.ProformaWhereInput {
  const andConditions: Prisma.ProformaWhereInput[] = [];

  if (params.search) {
    andConditions.push({
      OR: [
        { number: { contains: params.search, mode: "insensitive" } },
        { counterparty: { contains: params.search, mode: "insensitive" } },
      ],
    });
  }

  if (params.period || params.dateFrom || params.dateTo) {
    const dateRange = getDateRange(params.period ?? "", params.dateFrom, params.dateTo);
    if (dateRange.gte || dateRange.lte) andConditions.push({ date: dateRange });
  }

  if (params.status !== undefined && params.status !== "") {
    andConditions.push({ holdedStatus: parseInt(params.status, 10) });
  }

  if (params.marca) {
    const marcaValues = params.marca.split(",").filter(Boolean);
    const hasUnassigned = marcaValues.includes(MARCA_FILTER_UNASSIGNED);
    const namedMarcas = marcaValues.filter((m) => m !== MARCA_FILTER_UNASSIGNED);
    const marcaConditions: Prisma.ProformaWhereInput[] = [];
    if (hasUnassigned) marcaConditions.push({ marca: null });
    if (namedMarcas.length > 0) marcaConditions.push({ marca: { in: namedMarcas } });
    if (marcaConditions.length > 0) andConditions.push({ OR: marcaConditions });
  }

  if (params.project) {
    andConditions.push({ projectId: params.project });
  }

  if (params.alert === "expiring") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in5Days = new Date(today);
    in5Days.setDate(in5Days.getDate() + 5);
    in5Days.setHours(23, 59, 59, 999);
    andConditions.push({
      date: { gte: today, lte: in5Days },
      holdedStatus: { in: [0, 1] },
    });
  }

  return andConditions.length > 0 ? { AND: andConditions } : {};
}

async function getExpiringCount(): Promise<{ count: number; totalEur: number }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in5Days = new Date(today);
  in5Days.setDate(in5Days.getDate() + 5);
  in5Days.setHours(23, 59, 59, 999);

  const rows = await prisma.proforma.findMany({
    where: {
      date: { gte: today, lte: in5Days },
      holdedStatus: { in: [0, 1] },
    },
    select: { totalEur: true },
  });

  return {
    count: rows.length,
    totalEur: rows.reduce((s, r) => s + Number(r.totalEur), 0),
  };
}

export default async function ProformasPage({
  searchParams,
}: {
  searchParams: Promise<ProformaPageParams>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10));

  const where = buildWhere(params);

  const [total, proformas, projects, expiring] = await Promise.all([
    prisma.proforma.count({ where }),
    prisma.proforma.findMany({
      where,
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
        project: { select: { id: true, name: true } },
      },
      orderBy: { date: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.jiraProject.findMany({
      where: { active: true },
      select: { id: true, name: true, workspace: { select: { name: true } } },
      orderBy: { name: "asc" },
    }).then((ps) => ps.map((p) => ({ id: p.id, name: p.name, workspaceName: p.workspace.name }))),
    getExpiringCount(),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  function buildPageUrl(p: number): string {
    const sp = new URLSearchParams();
    if (params.search) sp.set("search", params.search);
    if (params.period) sp.set("period", params.period);
    if (params.dateFrom) sp.set("dateFrom", params.dateFrom);
    if (params.dateTo) sp.set("dateTo", params.dateTo);
    if (params.status) sp.set("status", params.status);
    if (params.marca) sp.set("marca", params.marca);
    if (params.project) sp.set("project", params.project);
    if (params.alert) sp.set("alert", params.alert);
    sp.set("page", String(p));
    return `/proformas?${sp.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Proformas</h1>
          <p className="text-sm text-gray-500 mt-1">Proformas de Holded · {total} en total</p>
        </div>
        <Suspense>
          <ProformasFilters projects={projects} />
        </Suspense>
      </div>

      {/* KPI: por convertir en los próximos 5 días */}
      {expiring.count > 0 && (
        params.alert === "expiring" ? (
          <div className="flex items-center gap-3 rounded-xl border border-orange-400 bg-orange-50 px-5 py-4">
            <AlertTriangle className="h-5 w-5 text-orange-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-orange-800">
                {expiring.count} proforma{expiring.count !== 1 ? "s" : ""} por convertir a factura en los próximos 5 días
              </p>
              <p className="text-xs text-orange-600 mt-0.5">
                Total: {formatCurrency(expiring.totalEur)}
              </p>
            </div>
            <Link
              href="/proformas"
              className="text-xs text-orange-600 hover:text-orange-800 underline flex-shrink-0"
            >
              Ver todas
            </Link>
          </div>
        ) : (
          <Link
            href="/proformas?alert=expiring"
            className="flex items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 hover:border-orange-400 px-5 py-4 transition-colors"
          >
            <AlertTriangle className="h-5 w-5 text-orange-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-orange-800">
                {expiring.count} proforma{expiring.count !== 1 ? "s" : ""} por convertir a factura en los próximos 5 días
              </p>
              <p className="text-xs text-orange-600 mt-0.5">
                Total: {formatCurrency(expiring.totalEur)} · Haz clic para filtrar
              </p>
            </div>
          </Link>
        )
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <Suspense>
          <ProformasTable proformas={proformas} projects={projects} selectedId={params.proformaId} />
        </Suspense>
      </div>

      <ProformaDrawer open={!!params.proformaId}>
        {params.proformaId && (
          <Suspense
            key={params.proformaId}
            fallback={
              <div className="text-sm text-gray-400 animate-pulse">Cargando…</div>
            }
          >
            <ProformaPanel proformaId={params.proformaId} />
          </Suspense>
        )}
      </ProformaDrawer>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>
            Página {page} de {totalPages} · {total} proformas
          </span>
          <div className="flex items-center gap-2">
            {page > 1 && (
              <Link
                href={buildPageUrl(page - 1)}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" /> Anterior
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={buildPageUrl(page + 1)}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors"
              >
                Siguiente <ChevronRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
