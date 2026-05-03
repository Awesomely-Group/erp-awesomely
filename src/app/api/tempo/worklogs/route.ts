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
    const worklogs = await tempo.getWorklogs(project.jiraKey, from, to);

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
