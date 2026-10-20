import type { ApiBudget } from "@/contracts";
import { apiRoute, companyWhere, page, paged } from "@/lib/api/v1";
import { prisma } from "@/lib/prisma";

/**
 * Presupuestos. Pagina, a diferencia del tool de MCP que lo sustituye: devolverlos
 * todos funcionaba con treinta y deja de funcionar con mil.
 */
export const GET = apiRoute(async (request, ctx) => {
  const url = new URL(request.url);
  const p = page(url);
  if (p instanceof Response) return p;

  const status = url.searchParams.get("status");
  const projectId = url.searchParams.get("projectId");

  const where = {
    ...(status ? { status: status as never } : {}),
    ...(projectId ? { projectId } : {}),
    ...companyWhere(ctx),
  };

  const [budgets, total] = await Promise.all([
    prisma.budget.findMany({
      where,
      select: {
        id: true,
        name: true,
        status: true,
        amount: true,
        companyId: true,
        projectId: true,
        project: { select: { jiraKey: true } },
        _count: { select: { lines: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: p.offset,
      take: p.limit,
    }),
    prisma.budget.count({ where }),
  ]);

  const body: ApiBudget[] = budgets.map((budget) => ({
    id: budget.id,
    name: budget.name,
    status: budget.status,
    projectId: budget.projectId,
    projectKey: budget.project?.jiraKey ?? null,
    companyId: budget.companyId,
    amount: budget.amount.toString(),
    lineCount: budget._count.lines,
  }));

  return paged(body, total, p);
}, { scope: "budgets:read" });
