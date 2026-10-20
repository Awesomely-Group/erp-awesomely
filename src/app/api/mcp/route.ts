/**
 * Ruta antigua del MCP. Se mantiene **una release** redirigiendo a `/api/v1/mcp`, para
 * no romper los clientes ya configurados el mismo día del despliegue.
 *
 * 307 y no 308: preserva el método y el cuerpo, que es lo que necesita un POST de
 * JSON-RPC, y no se queda cacheado como permanente mientras dure la transición.
 */
export const runtime = "nodejs";

export function POST(request: Request): Response {
  const destino = new URL("/api/v1/mcp", request.url);
  return Response.redirect(destino, 307);
}
