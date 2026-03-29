import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// One-time cleanup: strip https:// and trailing slash from Jira workspace domains
export async function POST(): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workspaces = await prisma.jiraWorkspace.findMany();

  const results: { id: string; name: string; before: string; after: string }[] = [];

  for (const w of workspaces) {
    const cleaned = w.domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (cleaned !== w.domain) {
      await prisma.jiraWorkspace.update({ where: { id: w.id }, data: { domain: cleaned } });
      results.push({ id: w.id, name: w.name, before: w.domain, after: cleaned });
    }
  }

  return NextResponse.json({ fixed: results.length, results });
}
