import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { syncAll } from "@/lib/sync";

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
    const result = await syncAll();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
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
