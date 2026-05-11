import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { JiraClient } from "@/lib/jira";
import { TempoClient } from "@/lib/tempo";
import { NextResponse } from "next/server";

export interface UserRoleOption {
  id: string;
  name: string;
  ratePerHour: number;
}

export interface ProjectUserRoleEntry {
  accountId: string;
  displayName: string;
  supplierId: string | null;
  roles: UserRoleOption[];
  effectiveRoleId: string | null;
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
  if (!project.workspace.tempoApiToken) return NextResponse.json([], { status: 200 });

  // Unique accountIds from Tempo worklogs
  const tempo = new TempoClient(project.workspace.tempoApiToken);
  const worklogs = await tempo.getWorklogs(project.jiraId, from, to);
  const accountIds = [...new Set(worklogs.map((w) => w.author.accountId))];
  if (accountIds.length === 0) return NextResponse.json([], { status: 200 });

  // Resolve display names
  const jira = new JiraClient(project.workspace.domain, project.workspace.email, project.workspace.apiToken);
  const nameMap = await jira.getUsersByAccountIds(accountIds);

  // Supplier data + project overrides
  const [suppliers, projectOverrides] = await Promise.all([
    prisma.supplier.findMany({
      where: { jiraAccountId: { in: accountIds } },
      include: { roles: { where: { active: true }, orderBy: { name: "asc" } } },
    }),
    prisma.projectUserRole.findMany({ where: { projectId, jiraAccountId: { in: accountIds } } }),
  ]);

  const supplierByAccountId = new Map(suppliers.map((s) => [s.jiraAccountId!, s]));
  const overrideByAccountId = new Map(projectOverrides.map((o) => [o.jiraAccountId, o.roleId]));

  const entries: ProjectUserRoleEntry[] = accountIds.map((accountId) => {
    const supplier = supplierByAccountId.get(accountId) ?? null;
    const overrideRoleId = overrideByAccountId.get(accountId) ?? null;
    const effectiveRoleId = overrideRoleId ?? supplier?.defaultRoleId ?? null;

    return {
      accountId,
      displayName: nameMap.get(accountId) ?? accountId,
      supplierId: supplier?.id ?? null,
      roles: supplier?.roles.map((r) => ({ id: r.id, name: r.name, ratePerHour: Number(r.ratePerHour) })) ?? [],
      effectiveRoleId,
    };
  });

  return NextResponse.json(entries);
}
