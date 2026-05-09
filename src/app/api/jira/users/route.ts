import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { JiraClient, type JiraUser } from "@/lib/jira";
import { NextResponse } from "next/server";

export async function GET(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query");
  const accountId = searchParams.get("accountId");
  const workspaceId = searchParams.get("workspaceId");

  if (!query && !accountId) {
    return NextResponse.json({ error: "Missing query or accountId" }, { status: 400 });
  }

  const workspace = workspaceId
    ? await prisma.jiraWorkspace.findUnique({ where: { id: workspaceId } })
    : await prisma.jiraWorkspace.findFirst({ where: { active: true } });

  if (!workspace) {
    return NextResponse.json({ error: "No Jira workspace configured" }, { status: 404 });
  }

  const jira = new JiraClient(workspace.domain, workspace.email, workspace.apiToken);

  if (accountId) {
    const names = await jira.getUsersByAccountIds([accountId]);
    const displayName = names.get(accountId);
    if (!displayName || displayName === accountId) {
      return NextResponse.json([]);
    }
    const user: JiraUser = { accountId, displayName, emailAddress: "", avatarUrl: null };
    return NextResponse.json([user]);
  }

  const users: JiraUser[] = await jira.searchUsers(query!);
  return NextResponse.json(users);
}
