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
  const workspaceId = searchParams.get("workspaceId");

  if (!query) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }

  const workspace = workspaceId
    ? await prisma.jiraWorkspace.findUnique({ where: { id: workspaceId } })
    : await prisma.jiraWorkspace.findFirst({ where: { active: true } });

  if (!workspace) {
    return NextResponse.json({ error: "No Jira workspace configured" }, { status: 404 });
  }

  const jira = new JiraClient(workspace.domain, workspace.email, workspace.apiToken);
  const users: JiraUser[] = await jira.searchUsers(query);

  return NextResponse.json(users);
}
