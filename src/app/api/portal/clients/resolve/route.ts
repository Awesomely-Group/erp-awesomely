import { authenticatePortalRequest } from "@/lib/portal-auth";
import { resolvePortalClient } from "@/lib/portal-data";
import { badRequest, json, unauthorized } from "@/lib/api-auth";

interface ResolveBody {
  brand?: unknown;
  email?: unknown;
}

/**
 * Del email de una persona a su cuenta de cliente. Lo llama gigsonapps.com antes de
 * emitir un enlace mágico.
 *
 * **POST y no GET aunque sea una lectura**: el email es un dato personal y en una query
 * string acaba en los logs de acceso de la plataforma, que es justo donde no debe estar.
 *
 * Los 404 llevan `code` para que el portal pueda decir algo útil, pero el portal debe
 * responder siempre lo mismo a quien escribe el correo: si no, el formulario se
 * convierte en un oráculo de quién es cliente de Gigson.
 */
export async function POST(request: Request): Promise<Response> {
  let body: ResolveBody;
  try {
    body = (await request.json()) as ResolveBody;
  } catch {
    return badRequest("Cuerpo JSON inválido");
  }

  if (!authenticatePortalRequest(request, body.brand)) return unauthorized();
  if (typeof body.email !== "string") return badRequest("Falta email");

  const result = await resolvePortalClient(body.brand, body.email);
  if (!result.ok) {
    const status = result.error === "AMBIGUOUS_EMAIL" ? 409 : 404;
    return json({ error: result.error, code: result.error, accountIds: result.accountIds }, status);
  }

  return json(result.client);
}
