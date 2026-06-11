import { json, unauthorized } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { syncJiraWorkspace } from "@/lib/sync";

/**
 * Receives Jira webhooks. Configure in Jira: System → WebHooks → Create a WebHook.
 * Add x-webhook-secret header matching CRON_SECRET or ERP_API_KEY.
 *
 * Supported events:
 *   - Any event: triggers a full Jira sync for the matching workspace
 *   - jira:issue_updated with status change on a "Project Epic": updates project status
 */
export async function POST(req: Request): Promise<Response> {
  const secret = req.headers.get("x-webhook-secret") ?? req.headers.get("x-api-key");
  const cronSecret = process.env.CRON_SECRET;
  const erpKey = process.env.ERP_API_KEY;

  const isValid =
    (cronSecret && secret === cronSecret) ||
    (erpKey && secret === erpKey);

  if (!isValid) return unauthorized();

  let payload: Record<string, unknown> = {};
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    // proceed with empty payload — still trigger sync
  }

  // Determine which workspace to sync by matching the Jira base URL
  const webhookEvent = payload.webhookEvent as string | undefined;
  const baseUrl = (payload.baseUrl ?? payload.jiraUrl) as string | undefined;

  let workspaceId: string | undefined;
  if (baseUrl) {
    const domain = baseUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const workspace = await prisma.jiraWorkspace.findFirst({
      where: { domain, active: true },
      select: { id: true },
    });
    workspaceId = workspace?.id;
  }

  if (!workspaceId) {
    // No matching workspace — sync all active workspaces
    const workspaces = await prisma.jiraWorkspace.findMany({
      where: { active: true },
      select: { id: true },
    });
    await Promise.all(
      workspaces.map((w) => syncJiraWorkspace(w.id, `webhook:jira:${webhookEvent ?? "unknown"}`))
    );
    return json({ ok: true, synced: workspaces.length, event: webhookEvent });
  }

  await syncJiraWorkspace(workspaceId, `webhook:jira:${webhookEvent ?? "unknown"}`);
  return json({ ok: true, workspaceId, event: webhookEvent });
}
