import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { JiraClient } from "@/lib/jira";
import { TempoClient } from "@/lib/tempo";
import { NextResponse } from "next/server";

export interface TempoWorklogUser {
  accountId: string;
  displayName: string;
  hours: number;
}

export interface TempoWorklogsResponse {
  users: TempoWorklogUser[];
  totalHours: number;
}

export interface TempoMonthlyHours {
  month: string; // "2025-01"
  totalHours: number;
}

export interface TempoWorklogsMonthlyResponse {
  months: TempoMonthlyHours[];
  totalHours: number;
}

export interface TempoWorklogEntry {
  accountId: string;
  displayName: string;
  issueKey: string;
  startDate: string;
  hours: number;
}

export interface TempoWorklogsDetailResponse {
  worklogs: TempoWorklogEntry[];
  totalHours: number;
}

export interface IssueHoursEntry {
  issueKey: string;
  summary: string;
  assigneeName: string | null;
  originalEstimateHours: number | null;
  spentHours: number;
}

export interface IssueHoursResponse {
  issues: IssueHoursEntry[];
  totalSpentHours: number;
  totalEstimateHours: number;
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!projectId || !from || !to) {
      return NextResponse.json({ error: "Missing projectId, from or to" }, { status: 400 });
    }

    const project = await prisma.jiraProject.findUnique({
      where: { id: projectId },
      include: { workspace: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (!project.workspace.tempoApiToken) {
      return NextResponse.json({ error: "Tempo API token not configured for this workspace" }, { status: 400 });
    }

    const tempo = new TempoClient(project.workspace.tempoApiToken);
    const worklogs = await tempo.getWorklogs(project.jiraId, from, to);

    const groupBy = searchParams.get("groupBy");

    if (groupBy === "issue") {
      const secondsByIssue = new Map<string, number>();
      for (const w of worklogs) {
        const key = w.issue.key;
        secondsByIssue.set(key, (secondsByIssue.get(key) ?? 0) + w.timeSpentSeconds);
      }
      const issueKeys = [...secondsByIssue.keys()];

      const jira = new JiraClient(project.workspace.domain, project.workspace.email, project.workspace.apiToken);
      const jiraIssues = await jira.getIssuesByKeys(issueKeys);
      const issueMap = new Map(jiraIssues.map((i) => [i.key, i]));

      const issues: IssueHoursEntry[] = issueKeys
        .map((key) => {
          const jiraData = issueMap.get(key);
          const spentSeconds = secondsByIssue.get(key) ?? 0;
          return {
            issueKey: key,
            summary: jiraData?.summary ?? key,
            assigneeName: jiraData?.assigneeName ?? null,
            originalEstimateHours: jiraData?.originalEstimateSeconds != null
              ? Math.round((jiraData.originalEstimateSeconds / 3600) * 100) / 100
              : null,
            spentHours: Math.round((spentSeconds / 3600) * 100) / 100,
          };
        })
        .sort((a, b) =>
          (a.assigneeName ?? "").localeCompare(b.assigneeName ?? "") ||
          a.issueKey.localeCompare(b.issueKey)
        );

      const totalSpentHours = Math.round(issues.reduce((s, i) => s + i.spentHours, 0) * 100) / 100;
      const totalEstimateHours = Math.round(
        issues.reduce((s, i) => s + (i.originalEstimateHours ?? 0), 0) * 100
      ) / 100;

      return NextResponse.json({ issues, totalSpentHours, totalEstimateHours } satisfies IssueHoursResponse);
    }

    if (groupBy === "worklog") {
      const accountIds = [...new Set(worklogs.map((w) => w.author.accountId))];
      const jira = new JiraClient(
        project.workspace.domain,
        project.workspace.email,
        project.workspace.apiToken
      );
      const nameMap = await jira.getUsersByAccountIds(accountIds);
      const entries: TempoWorklogEntry[] = worklogs
        .map((w) => ({
          accountId: w.author.accountId,
          displayName: nameMap.get(w.author.accountId) ?? w.author.accountId,
          issueKey: w.issue.key,
          startDate: w.startDate,
          hours: Math.round((w.timeSpentSeconds / 3600) * 100) / 100,
        }))
        .sort((a, b) => b.startDate.localeCompare(a.startDate));
      const totalHours = Math.round(entries.reduce((sum, e) => sum + e.hours, 0) * 100) / 100;
      return NextResponse.json({ worklogs: entries, totalHours } satisfies TempoWorklogsDetailResponse);
    }

    if (groupBy === "month") {
      const secondsByMonth = new Map<string, number>();
      for (const w of worklogs) {
        const month = w.startDate.slice(0, 7);
        secondsByMonth.set(month, (secondsByMonth.get(month) ?? 0) + w.timeSpentSeconds);
      }
      const months: TempoMonthlyHours[] = [...secondsByMonth.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, seconds]) => ({
          month,
          totalHours: Math.round((seconds / 3600) * 100) / 100,
        }));
      const totalHours = Math.round(months.reduce((sum, m) => sum + m.totalHours, 0) * 100) / 100;
      return NextResponse.json({ months, totalHours } satisfies TempoWorklogsMonthlyResponse);
    }

    const secondsByAccount = new Map<string, number>();
    for (const w of worklogs) {
      const id = w.author.accountId;
      secondsByAccount.set(id, (secondsByAccount.get(id) ?? 0) + w.timeSpentSeconds);
    }

    const accountIds = [...secondsByAccount.keys()];
    const jira = new JiraClient(
      project.workspace.domain,
      project.workspace.email,
      project.workspace.apiToken
    );
    const nameMap = await jira.getUsersByAccountIds(accountIds);

    const users: TempoWorklogUser[] = accountIds
      .map((accountId) => ({
        accountId,
        displayName: nameMap.get(accountId) ?? accountId,
        hours: Math.round(((secondsByAccount.get(accountId) ?? 0) / 3600) * 100) / 100,
      }))
      .sort((a, b) => b.hours - a.hours);

    const totalHours = Math.round(users.reduce((sum, u) => sum + u.hours, 0) * 100) / 100;

    return NextResponse.json({ users, totalHours } satisfies TempoWorklogsResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
