import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { syncAll } from "@/lib/sync";

// Called by Vercel Cron (every hour) or manually from the UI
// Header: Authorization: Bearer <CRON_SECRET>
export async function POST(req: Request): Promise<NextResponse> {
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
