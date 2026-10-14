import { auth } from "@/lib/auth";

/**
 * Autenticación de las rutas **internas** de la app: solo sesión.
 *
 * Antes aceptaba también `x-api-key`, y eso dejaba dos puertas al mismo dato con reglas
 * distintas: una con sesión y rol, otra con una clave sin dueño ni permisos. Las
 * credenciales programáticas entran ahora por `/api/v1`, donde hay scopes, caducidad y
 * frontera de sociedad.
 *
 * El cambio además cierra una incoherencia que ya existía: `/api/invoices/[id]`,
 * `classify-lines` y los dos PDFs aceptaban `x-api-key` en el handler mientras el
 * middleware los redirigía a /login, así que por API eran inalcanzables de todas formas.
 */
export async function authenticateRequest(_req: Request): Promise<boolean> {
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

/**
 * Fallo de un servicio externo (Holded), no del recurso pedido. Se distingue de
 * `notFound` para que la UI pueda decir "no se pudo conectar" en vez de dar a
 * entender que el documento no existe.
 */
export function upstreamError(message: string, status = 502): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
