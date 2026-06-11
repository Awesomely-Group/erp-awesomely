import { json, unauthorized } from "@/lib/api-auth";
import { syncAll } from "@/lib/sync";

export async function POST(req: Request): Promise<Response> {
  const secret = req.headers.get("x-webhook-secret") ?? req.headers.get("x-api-key");
  const cronSecret = process.env.CRON_SECRET;
  const erpKey = process.env.ERP_API_KEY;

  const isValid =
    (cronSecret && secret === cronSecret) ||
    (erpKey && secret === erpKey);

  if (!isValid) return unauthorized();

  try {
    const result = await syncAll("webhook:holded");
    return json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
