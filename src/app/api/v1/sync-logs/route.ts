import type { ApiSyncLog } from "@/contracts";
import { apiRoute, companyWhere, page, paged } from "@/lib/api/v1";
import { prisma } from "@/lib/prisma";

/** Historial de sincronizaciones: para saber si una integración está viva. */
export const GET = apiRoute(async (request, ctx) => {
  const url = new URL(request.url);
  const p = page(url);
  if (p instanceof Response) return p;

  const source = url.searchParams.get("source");
  const where = { ...(source ? { source: source as never } : {}), ...companyWhere(ctx) };

  const [logs, total] = await Promise.all([
    prisma.syncLog.findMany({
      where,
      select: {
        id: true,
        source: true,
        result: true,
        startedAt: true,
        finishedAt: true,
        companyId: true,
        invoicesSynced: true,
        projectsSynced: true,
        errorMessage: true,
      },
      orderBy: { startedAt: "desc" },
      skip: p.offset,
      take: p.limit,
    }),
    prisma.syncLog.count({ where }),
  ]);

  const body: ApiSyncLog[] = logs.map((log) => ({
    id: log.id,
    source: log.source,
    result: log.result,
    startedAt: log.startedAt.toISOString(),
    finishedAt: log.finishedAt ? log.finishedAt.toISOString() : null,
    companyId: log.companyId,
    invoicesSynced: log.invoicesSynced,
    projectsSynced: log.projectsSynced,
    errorMessage: log.errorMessage,
  }));

  return paged(body, total, p);
}, { scope: "ops:read" });
