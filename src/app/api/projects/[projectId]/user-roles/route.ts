import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { projectAuthors } from "@/lib/hours-source";
import { NextResponse } from "next/server";

export interface UserRoleOption {
  id: string;
  name: string;
}

export interface ProjectUserRoleResponse {
  /** De dónde salieron los autores. `UNAVAILABLE` = proyecto sin vincular a Giro. */
  source: "GIRO" | "TEMPO" | "UNAVAILABLE";
  entries: ProjectUserRoleEntry[];
}

export interface ProjectUserRoleEntry {
  accountId: string;
  displayName: string;
  roles: UserRoleOption[];
  effectiveRoleId: string | null;
  supplierRate: number | null;
  projectRate: number | null;
  defaultRoleName: string | null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await params;
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!from || !to) return NextResponse.json({ error: "Missing from/to" }, { status: 400 });

  const project = await prisma.jiraProject.findUnique({
    where: { id: projectId },
    include: { workspace: true },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Quién imputó sale de Giro si el proyecto está vinculado, y de Tempo mientras no lo
  // esté. `projectAuthors` devuelve ya el `accountId`, que es por donde el ERP tiene
  // escritos los roles y las tarifas.
  //
  // Para un proyecto de fee regular interesa quién ha tocado el proyecto **alguna vez**
  // y no solo en el mes mirado: el fee se reparte entre el equipo asignado, no entre
  // quien casualmente imputó esas semanas.
  const { source, authors } = await projectAuthors(project, {
    from,
    to,
    incluirTodoElHistorico: project.isFeeRegular,
  });

  const accountIds = [...new Set(authors.map((autor) => autor.accountId))];
  const nameMap = new Map(authors.map((autor) => [autor.accountId, autor.displayName]));

  // `source` viaja en la respuesta aunque no haya nadie: una lista vacía porque el
  // proyecto no está vinculado no significa lo mismo que una lista vacía porque nadie
  // imputó, y la pantalla tiene que poder decirlo.
  if (accountIds.length === 0) {
    return NextResponse.json({ source, entries: [] } satisfies ProjectUserRoleResponse);
  }

  const [roleTemplates, projectOverrides, suppliers] = await Promise.all([
    prisma.roleTemplate.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.projectUserRole.findMany({
      where: { projectId, jiraAccountId: { in: accountIds } },
      select: { jiraAccountId: true, roleId: true, ratePerHour: true },
    }),
    prisma.supplier.findMany({
      where: { jiraUsers: { some: { accountId: { in: accountIds } } } },
      select: {
        jiraUsers: { select: { accountId: true } },
        hourlyRate: true,
        defaultRole: { select: { name: true, ratePerHour: true } },
      },
    }),
  ]);

  const overrideByAccountId = new Map(projectOverrides.map((o) => [o.jiraAccountId, { roleId: o.roleId, ratePerHour: o.ratePerHour }]));

  const supplierByAccount = new Map<string, typeof suppliers[number]>();
  for (const s of suppliers) {
    for (const u of s.jiraUsers) {
      supplierByAccount.set(u.accountId, s);
    }
  }

  const roles: UserRoleOption[] = roleTemplates.map((r) => ({
    id: r.id,
    name: r.name,
  }));

  const entries: ProjectUserRoleEntry[] = accountIds.map((accountId) => {
    const override = overrideByAccountId.get(accountId);
    const supplier = supplierByAccount.get(accountId);
    const supplierRate = supplier?.defaultRole != null
      ? Number(supplier.defaultRole.ratePerHour)
      : supplier?.hourlyRate != null
        ? Number(supplier.hourlyRate)
        : null;

    return {
      accountId,
      displayName: nameMap.get(accountId) ?? accountId,
      roles,
      effectiveRoleId: override?.roleId ?? null,
      supplierRate,
      projectRate: override?.ratePerHour != null ? Number(override.ratePerHour) : null,
      defaultRoleName: supplier?.defaultRole?.name ?? null,
    };
  });

  return NextResponse.json({ source, entries } satisfies ProjectUserRoleResponse);
}
