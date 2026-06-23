import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/sync-logs/[id]
// Returns a single sync log with its details (fetchedIds + upsertErrors).
// Used by the sync table modal to diagnose which documents arrived in a given sync run.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const log = await prisma.syncLog.findUnique({
    where: { id },
    include: { company: true, workspace: true },
  });

  if (!log) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    id: log.id,
    source: log.source,
    entityName: log.company?.name ?? log.workspace?.name ?? "—",
    result: log.result,
    startedAt: log.startedAt.toISOString(),
    finishedAt: log.finishedAt?.toISOString() ?? null,
    errorMessage: log.errorMessage,
    details: log.details ?? null,
  });
}
