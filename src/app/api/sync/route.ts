import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { syncAll, SyncAlreadyRunningError } from "@/lib/sync";
import { parseSyncMode } from "@/lib/sync-scope";

// El cron del domingo (`?mode=full`) relee toda la historia: con las empresas en serie
// son ~410 s, medidos sobre el coste real de los últimos syncs completos. El incremental
// de diario se queda en ~200 s y cabe aquí; el full NO — ver la nota de sync-timing.ts.
export const maxDuration = 300;

async function handleSync(req: Request): Promise<NextResponse> {
  // Allow both authenticated users and the cron job
  const session = await auth();
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;
  const isUser = !!session;

  if (!isCron && !isUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // `?mode=full` relee toda la historia (cron semanal); por defecto,
    // incremental — que es lo que corre a diario y lo que gasta poca cuota.
    const mode = parseSyncMode(new URL(req.url).searchParams.get("mode"));
    const triggeredBy = isCron ? "cron" : (session?.user?.email ?? undefined);
    const result = await syncAll(triggeredBy, undefined, mode);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof SyncAlreadyRunningError) {
      return NextResponse.json(
        { ok: false, error: err.message, runningSince: err.runningSince.toISOString() },
        { status: 409 },
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// Manual sync from the dashboard
export async function POST(req: Request): Promise<NextResponse> {
  return handleSync(req);
}

// Vercel Cron requests use GET
export async function GET(req: Request): Promise<NextResponse> {
  return handleSync(req);
}
