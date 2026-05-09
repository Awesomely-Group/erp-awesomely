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

  if (!query && !accountId) {
    return NextResponse.json({ error: "Missing query or accountId" }, { status: 400 });
  }

  const workspaces = await prisma.jiraWorkspace.findMany({ where: { active: true } });

  if (workspaces.length === 0) {
    return NextResponse.json({ error: "No Jira workspace configured" }, { status: 404 });
  }

  const clients = workspaces.map((w) => new JiraClient(w.domain, w.email, w.apiToken));

  if (accountId) {
    const results = await Promise.all(clients.map((c) => c.getUsersByAccountIds([accountId])));
    for (const names of results) {
      const displayName = names.get(accountId);
      if (displayName && displayName !== accountId) {
        const user: JiraUser = { accountId, displayName, emailAddress: "", avatarUrl: null };
        return NextResponse.json([user]);
      }
    }
    return NextResponse.json([]);
  }

  const perWorkspace = await Promise.all(clients.map((c) => c.searchUsers(query!)));
  const seen = new Set<string>();
  const users: JiraUser[] = [];
  for (const batch of perWorkspace) {
    for (const u of batch) {
      if (!seen.has(u.accountId)) {
        seen.add(u.accountId);
        users.push(u);
      }
    }
  }

  return NextResponse.json(users);
}
