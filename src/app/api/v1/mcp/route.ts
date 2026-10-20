/**
 * El servidor MCP del ERP, bajo `/api/v1` con el resto de la API.
 *
 * Autentica con `Authorization: Bearer erp_…` y la **misma** cadena que las rutas de
 * `/api/v1` (`resolveApiContext`): una sola puerta y una sola cerradura. Se llama **sin
 * scope** porque aquí el recorte es qué herramientas llega a ver la credencial, no si
 * puede hablar.
 *
 * `x-api-key` se sigue aceptando **una release más**, y solo contra claves de la base
 * con dueño: es lo que hay configurado hoy en los clientes, y romperlo el mismo día que
 * todo lo demás multiplicaría el riesgo del despliegue sin ganar nada. El `ERP_API_KEY`
 * de entorno, en cambio, **muere aquí**: era una clave maestra sin dueño, sin caducidad
 * y sin permisos.
 */
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { apiError, resolveApiContext, type ApiContext } from "@/lib/api/v1";
import { resolveApiIdentity } from "@/lib/api-keys";
import { createMcpServer } from "@/lib/mcp/server";

export const runtime = "nodejs";
export const maxDuration = 60;

async function identidad(request: Request): Promise<ApiContext | Response> {
  const legacy = request.headers.get("x-api-key");
  if (legacy && !request.headers.get("authorization")) {
    console.warn("[mcp] clave por x-api-key: cabecera legacy, migra a Authorization: Bearer");
    const resuelta = await resolveApiIdentity(legacy);
    if (resuelta) return resuelta;
    return apiError(401, "unauthorized", "API key no válida");
  }
  return resolveApiContext(request);
}

export async function POST(request: Request): Promise<Response> {
  const context = await identidad(request);
  if (context instanceof Response) {
    context.headers.set("WWW-Authenticate", 'Bearer realm="erp"');
    return context;
  }

  const server = createMcpServer(context);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  await server.connect(transport);
  return transport.handleRequest(request);
}

/** Sin sesión no hay stream que reanudar: 405 explícito en vez de un 404 confuso. */
function noSoportado(): Response {
  return apiError(405, "bad_request", "Este MCP es stateless: solo acepta POST");
}

export const GET = noSoportado;
export const DELETE = noSoportado;
