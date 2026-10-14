import type { ApiProject } from "@/contracts";
import { apiRoute, page, paged } from "@/lib/api/v1";
import { prisma } from "@/lib/prisma";

/**
 * Los proyectos del ERP. No lleva filtro de sociedad: `JiraProject` no tiene
 * `companyId` — la sociedad aparece más abajo, en la factura. Un listado de proyectos
 * es además el dato más inocuo que hay aquí, y por eso `projects:read` va suelto: para
 * que un bot pueda listarlos sin que se le conceda facturación.
 */
export const GET = apiRoute(async (request) => {
  const url = new URL(request.url);
  const p = page(url);
  if (p instanceof Response) return p;

  const status = url.searchParams.get("status");
  const where = {
    active: true,
    ...(status ? { status: status as never } : {}),
  };

  const [projects, total] = await Promise.all([
    prisma.jiraProject.findMany({
      where,
      select: {
        id: true,
        jiraKey: true,
        name: true,
        status: true,
        isPrecioCerrado: true,
        isBolsasHoras: true,
        isFeeRegular: true,
        giroProjectId: true,
        workspace: { select: { name: true } },
        _count: { select: { budgets: true, hourBuckets: true } },
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      skip: p.offset,
      take: p.limit,
    }),
    prisma.jiraProject.count({ where }),
  ]);

  const body: ApiProject[] = projects.map((project) => ({
    id: project.id,
    jiraKey: project.jiraKey,
    name: project.name,
    status: project.status,
    isPrecioCerrado: project.isPrecioCerrado,
    isBolsasHoras: project.isBolsasHoras,
    isFeeRegular: project.isFeeRegular,
    workspaceName: project.workspace?.name ?? null,
    giroProjectId: project.giroProjectId,
    budgetCount: project._count.budgets,
    hourBucketCount: project._count.hourBuckets,
  }));

  return paged(body, total, p);
}, { scope: "projects:read" });
