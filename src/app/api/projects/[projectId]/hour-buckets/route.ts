import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TempoClient } from "@/lib/tempo";
import { JiraClient } from "@/lib/jira";
import { NextResponse } from "next/server";

export interface HourBucketEntry {
  id: string;
  roleId: string;
  roleName: string;
  code: string | null;
  ratePerHour: number;
  totalHours: number;
  consumedHours: number;
  alertThreshold: number;
  startDate: string | null;
  endDate: string | null;
}

export interface UnassignedUser {
  accountId: string;
  displayName: string;
  hours: number;
}

export interface HourBucketsResponse {
  buckets: HourBucketEntry[];
  unassignedUsers: UnassignedUser[];
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
        include: { role: true },
      },
      userRoles: true,
    },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (project.hourBuckets.length === 0) {
    return NextResponse.json({ buckets: [], unassignedUsers: [] } satisfies HourBucketsResponse);
  }

  // Get Tempo worklogs if token exists; otherwise all consumed = 0
  // Fetch all history so consumption is not date-restricted (bucket dates are informational only)
  type WorklogEntry = { accountId: string; issueNumericId: number; hours: number; date: string };
  let worklogs: WorklogEntry[] = [];

  if (project.workspace.tempoApiToken) {
    const today = new Date().toISOString().slice(0, 10);
    const tempo = new TempoClient(project.workspace.tempoApiToken);
    const raw = await tempo.getWorklogs(project.jiraId, "2020-01-01", today);
    worklogs = raw.map((w) => ({
      accountId: w.author.accountId,
      issueNumericId: w.issue.id,
      hours: w.timeSpentSeconds / 3600,
      date: w.startDate,
    }));
  }

  // Map accountId → roleId via ProjectUserRole
  const accountToRole = new Map<string, string>();
  for (const ur of project.userRoles) {
    accountToRole.set(ur.jiraAccountId, ur.roleId);
  }

  // Map roleId → bucketId for role-based fallback
  const roleToBucket = new Map<string, string>();
  for (const bucket of project.hourBuckets) {
    roleToBucket.set(bucket.roleId, bucket.id);
  }

  // Load explicit issue → bucket assignments
  const issueAssignments = await prisma.issueHourBucketAssignment.findMany({
    where: { projectId },
    select: { issueNumericId: true, hourBucketId: true },
  });
  const assignmentByIssueNumericId = new Map<number, string>();
  for (const a of issueAssignments) {
    assignmentByIssueNumericId.set(a.issueNumericId, a.hourBucketId);
  }

  // Detect unassigned users within the current view period only (not all history)
  const hoursPerUnassigned = new Map<string, number>();
  for (const w of worklogs) {
    if (!accountToRole.has(w.accountId) && w.date >= from && w.date <= to) {
      hoursPerUnassigned.set(w.accountId, (hoursPerUnassigned.get(w.accountId) ?? 0) + w.hours);
    }
  }

  // Resolve display names for unassigned users
  let unassignedUsers: UnassignedUser[] = [];
  if (hoursPerUnassigned.size > 0) {
    const unassignedIds = [...hoursPerUnassigned.keys()];
    let nameMap = new Map<string, string>();
    try {
      const jira = new JiraClient(project.workspace.domain, project.workspace.email, project.workspace.apiToken);
      nameMap = await jira.getUsersByAccountIds(unassignedIds);
    } catch {
      // Fall back to accountId as display name
    }
    unassignedUsers = unassignedIds.map((accountId) => ({
      accountId,
      displayName: nameMap.get(accountId) ?? accountId,
      hours: Math.round((hoursPerUnassigned.get(accountId) ?? 0) * 100) / 100,
    })).sort((a, b) => b.hours - a.hours);
  }

  // Sum hours per bucket:
  // - Issues with explicit assignment → assigned bucket
  // - Issues without assignment → role-based bucket (fallback)
  const hoursPerBucket = new Map<string, number>(project.hourBuckets.map((b) => [b.id, 0]));
  for (const w of worklogs) {
    const assignedBucketId = assignmentByIssueNumericId.get(w.issueNumericId);
    if (assignedBucketId !== undefined) {
      if (hoursPerBucket.has(assignedBucketId)) {
        hoursPerBucket.set(assignedBucketId, (hoursPerBucket.get(assignedBucketId) ?? 0) + w.hours);
      }
    } else {
      const roleId = accountToRole.get(w.accountId);
      if (roleId !== undefined) {
        const bucketId = roleToBucket.get(roleId);
        if (bucketId !== undefined) {
          hoursPerBucket.set(bucketId, (hoursPerBucket.get(bucketId) ?? 0) + w.hours);
        }
      }
    }
  }

  const buckets: HourBucketEntry[] = project.hourBuckets.map((bucket) => ({
    id: bucket.id,
    roleId: bucket.roleId,
    roleName: bucket.role.name,
    code: bucket.code ?? null,
    ratePerHour: Number(bucket.role.ratePerHour),
    totalHours: bucket.totalHours,
    consumedHours: Math.round((hoursPerBucket.get(bucket.id) ?? 0) * 100) / 100,
    alertThreshold: bucket.alertThreshold,
    startDate: bucket.startDate ? bucket.startDate.toISOString().slice(0, 10) : null,
    endDate: bucket.endDate ? bucket.endDate.toISOString().slice(0, 10) : null,
  }));

  return NextResponse.json({ buckets, unassignedUsers } satisfies HourBucketsResponse);
}
