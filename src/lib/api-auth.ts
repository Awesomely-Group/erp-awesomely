import { auth } from "@/lib/auth";
import { validateApiKey } from "@/lib/mcp/validate-key";

/** Returns true if the request has a valid session OR a valid API key. */
export async function authenticateRequest(req: Request): Promise<boolean> {
  const apiKey = req.headers.get("x-api-key");
  if (await validateApiKey(apiKey)) return true;
  const session = await auth();
  return !!session?.user;
}

export function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

export function badRequest(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
}

export function notFound(message = "Not found"): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
