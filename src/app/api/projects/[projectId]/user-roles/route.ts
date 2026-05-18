import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { JiraClient } from "@/lib/jira";
import { TempoClient } from "@/lib/tempo";
import { NextResponse } from "next/server";

export interface UserRoleOption {
  id: string;
  name: string;
}

export interface ProjectUserRoleEntry {
  accountId: string;
  displayName: string;
  roles: UserRoleOption[];
  effectiveRoleId: string | null;
  supplierRate: number | null;
  projectRate: number | null;
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

  const tempo = new TempoClient(project.workspace.tempoApiToken);

  let accountIds: string[];
  if (project.isFeeRegular) {
    const today = new Date().toISOString().slice(0, 10);
    const [periodWorklogs, allWorklogs] = await Promise.all([
      tempo.getWorklogs(project.jiraId, from, to),
      tempo.getWorklogs(project.jiraId, "2020-01-01", today),
    ]);
    const seen = new Set<string>();
    for (const w of allWorklogs) seen.add(w.author.accountId);
    for (const w of periodWorklogs) seen.add(w.author.accountId);
    accountIds = [...seen];
  } else {
    const worklogs = await tempo.getWorklogs(project.jiraId, from, to);
    accountIds = [...new Set(worklogs.map((w) => w.author.accountId))];
  }

  if (accountIds.length === 0) return NextResponse.json([], { status: 200 });

  const jira = new JiraClient(project.workspace.domain, project.workspace.email, project.workspace.apiToken);
  const [nameMap, roleTemplates, projectOverrides, suppliers] = await Promise.all([
    jira.getUsersByAccountIds(accountIds),
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
        defaultRole: { select: { ratePerHour: true } },
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
    };
  });

  return NextResponse.json(entries);
}
