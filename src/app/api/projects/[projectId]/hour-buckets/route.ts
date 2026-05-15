import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TempoClient } from "@/lib/tempo";
import { NextResponse } from "next/server";

export interface HourBucketEntry {
  id: string;
  roleId: string;
  roleName: string;
  supplierName: string;
  ratePerHour: number;
  totalHours: number;
  consumedHours: number;
  alertThreshold: number;
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
    include: {
      workspace: true,
      hourBuckets: {
        where: { active: true },
        include: { role: { include: { supplier: true } } },
      },
      userRoles: true,
    },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (project.hourBuckets.length === 0) {
    return NextResponse.json([] as HourBucketEntry[]);
  }

  // Get Tempo worklogs if token exists; otherwise all consumed = 0
  let hoursPerAccountId: Map<string, number> = new Map();

  if (project.workspace.tempoApiToken) {
    const tempo = new TempoClient(project.workspace.tempoApiToken);
    const worklogs = await tempo.getWorklogs(project.jiraId, from, to);
    for (const w of worklogs) {
      const current = hoursPerAccountId.get(w.author.accountId) ?? 0;
      hoursPerAccountId.set(w.author.accountId, current + w.timeSpentSeconds / 3600);
    }
  }

  // Map accountId → roleId via ProjectUserRole
  const accountToRole = new Map<string, string>();
  for (const ur of project.userRoles) {
    accountToRole.set(ur.jiraAccountId, ur.roleId);
  }

  // Sum hours per role
  const hoursPerRole = new Map<string, number>();
  for (const [accountId, hours] of hoursPerAccountId) {
    const roleId = accountToRole.get(accountId);
    if (!roleId) continue;
    hoursPerRole.set(roleId, (hoursPerRole.get(roleId) ?? 0) + hours);
  }

  const result: HourBucketEntry[] = project.hourBuckets.map((bucket) => ({
    id: bucket.id,
    roleId: bucket.roleId,
    roleName: bucket.role.name,
    supplierName: bucket.role.supplier.name,
    ratePerHour: Number(bucket.role.ratePerHour),
    totalHours: bucket.totalHours,
    consumedHours: Math.round((hoursPerRole.get(bucket.roleId) ?? 0) * 100) / 100,
    alertThreshold: bucket.alertThreshold,
  }));

  return NextResponse.json(result);
}
