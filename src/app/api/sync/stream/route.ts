import { auth } from "@/lib/auth";
import { syncAll, type SyncProgressEvent } from "@/lib/sync";
import { parseSyncMode } from "@/lib/sync-scope";

// El cron del domingo (`?mode=full`) relee toda la historia: con las empresas en serie
// son ~410 s, medidos sobre el coste real de los últimos syncs completos. El incremental
// de diario se queda en ~200 s y cabe aquí; el full NO — ver la nota de sync-timing.ts.
export const maxDuration = 300;

export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;
  const isUser = !!session;

  if (!isCron && !isUser) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const triggeredBy = isCron ? "cron" : (session?.user?.email ?? undefined);
  // El botón de sincronizar del dashboard es incremental; `?mode=full` fuerza
  // la relectura completa cuando de verdad hace falta.
  const mode = parseSyncMode(new URL(req.url).searchParams.get("mode"));
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: SyncProgressEvent): void {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Client disconnected — ignore
        }
      }

      try {
        const result = await syncAll(triggeredBy, send, mode);
        send({ type: "complete", ...result });
      } catch (err) {
        send({ type: "fatal", error: err instanceof Error ? err.message : String(err) });
      } finally {
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // Disable Nginx buffering in proxied setups
    },
  });
}
