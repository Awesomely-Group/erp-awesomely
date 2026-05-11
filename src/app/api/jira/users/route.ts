import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { JiraClient, type JiraUser } from "@/lib/jira";
import { TempoClient } from "@/lib/tempo";
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

  // Use allSettled so a single failing workspace doesn't suppress all results
  const searchResults = await Promise.allSettled(clients.map((c) => c.searchUsers(query!)));
  const seen = new Set<string>();
  const users: JiraUser[] = [];
  for (const result of searchResults) {
    if (result.status !== "fulfilled") continue;
    for (const u of result.value) {
      if (!seen.has(u.accountId)) {
        seen.add(u.accountId);
        users.push(u);
      }
    }
  }

  // Complementar con usuarios de Tempo que no aparecen en Jira search (suspended/eliminated).
  // Uses GET /4/users (fast) with fallback to scanning worklogs from the last year.
  const tempoWorkspace = workspaces.find((w) => w.tempoApiToken);
  if (tempoWorkspace?.tempoApiToken) {
    const q = query!.toLowerCase();
    const tempoClient = new TempoClient(tempoWorkspace.tempoApiToken);

    try {
      let tempoIds: Set<string>;
      try {
        tempoIds = await tempoClient.getUserAccountIds();
      } catch {
        // /4/users not available — fall back to scanning worklogs
        const yearAgo = new Date();
        yearAgo.setFullYear(yearAgo.getFullYear() - 1);
        tempoIds = await tempoClient.getUniqueAuthorAccountIds(
          yearAgo.toISOString().slice(0, 10),
          new Date().toISOString().slice(0, 10)
        );
      }

      const unknownIds = [...tempoIds].filter((id) => !seen.has(id));

      const resolved = await Promise.all(
        unknownIds.map(async (accountId) => {
          for (const client of clients) {
            const u = await client.getUserByAccountId(accountId);
            if (u) return u;
          }
          return null;
        })
      );

      for (const u of resolved) {
        if (!u) continue;
        const matches =
          u.displayName.toLowerCase().includes(q) ||
          u.emailAddress.toLowerCase().includes(q);
        if (matches && !seen.has(u.accountId)) {
          seen.add(u.accountId);
          users.push(u);
        }
      }
    } catch {
      // Tempo lookup failed entirely — return Jira-only results
    }
  }

  return NextResponse.json(users);
}
