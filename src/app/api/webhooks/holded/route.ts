import { json, unauthorized } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { syncAll, SyncAlreadyRunningError } from "@/lib/sync";
import { SyncSource } from "@prisma/client";

// Holded puede disparar un webhook por cada documento que cambia. Antes cada
// evento lanzaba un syncAll completo (toda la historia, todas las empresas), así
// que una tarde de facturación se comía la cuota de API del mes entero. Ahora:
//   1. el sync es incremental — solo la ventana reciente;
//   2. se ignoran los eventos que llegan dentro del periodo de enfriamiento,
//      porque el siguiente sync ya recogerá esos cambios igualmente.
const DEFAULT_MIN_INTERVAL_MINUTES = 10;

function minIntervalMinutes(): number {
  const raw = process.env.HOLDED_WEBHOOK_MIN_INTERVAL_MINUTES;
  if (!raw) return DEFAULT_MIN_INTERVAL_MINUTES;
  const parsed = Number.parseInt(raw, 10);
  // 0 desactiva el enfriamiento (cada webhook sincroniza).
  return Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : DEFAULT_MIN_INTERVAL_MINUTES;
}

const TRIGGERED_BY = "webhook:holded";

// Igual que /api/sync y /api/sync/stream: este webhook también lanza un syncAll entero
// (incremental, pero con las empresas en serie).
export const maxDuration = 300;

export async function POST(req: Request): Promise<Response> {
  const secret =
    req.headers.get("x-webhook-secret") ?? req.headers.get("x-api-key");
  const cronSecret = process.env.CRON_SECRET;
  const erpKey = process.env.ERP_API_KEY;

  const isValid =
    (cronSecret && secret === cronSecret) || (erpKey && secret === erpKey);

  if (!isValid) return unauthorized();

  try {
    const cooldownMinutes = minIntervalMinutes();

    if (cooldownMinutes > 0) {
      const since = new Date(Date.now() - cooldownMinutes * 60_000);
      const recent = await prisma.syncLog.findFirst({
        where: {
          source: SyncSource.HOLDED,
          triggeredBy: TRIGGERED_BY,
          startedAt: { gte: since },
        },
        select: { startedAt: true },
        orderBy: { startedAt: "desc" },
      });

      if (recent) {
        return json({
          ok: true,
          skipped: true,
          reason: `Ya se sincronizó a las ${recent.startedAt.toISOString()}; siguiente ventana en ${cooldownMinutes} min`,
        });
      }
    }

    const result = await syncAll(TRIGGERED_BY, undefined, "incremental");
    return json({ ok: true, result });
  } catch (err) {
    // Ya hay un sync en marcha: no es un fallo del webhook. Se responde OK a propósito —
    // un 500 repetido puede hacer que Holded acabe desactivando el webhook, y lo que traía
    // este aviso lo recoge la ejecución en curso o, como muy tarde, el cron diario.
    if (err instanceof SyncAlreadyRunningError) {
      return json({ ok: true, skipped: true, reason: err.message });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
