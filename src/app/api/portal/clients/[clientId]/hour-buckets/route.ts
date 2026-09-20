import { authenticatePortalRequest } from "@/lib/portal-auth";
import { getPortalHourBuckets } from "@/lib/portal-data";
import { json, notFound, unauthorized } from "@/lib/api-auth";

/**
 * Saldo de las bolsas de un cliente. Sale de la foto que deja `/api/sync/hours`, nunca
 * de una llamada a Giro en caliente: su endpoint de partes no pagina ni acepta límite.
 *
 * `stale`/`computedAt` viajan a propósito: si el cron lleva un día sin poder actualizar,
 * el cliente tiene que ver "no pudimos actualizar" y no un saldo con pinta de fresco.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ clientId: string }> },
): Promise<Response> {
  const brand = new URL(request.url).searchParams.get("brand");
  if (!authenticatePortalRequest(request, brand)) return unauthorized();

  const { clientId } = await params;
  const data = await getPortalHourBuckets(brand, clientId);
  // El mismo 404 para "no existe" y para "no es tuyo": distinguirlos diría a quien
  // prueba identificadores cuáles existen.
  if (data === null) return notFound("Cliente no encontrado");

  return json(data);
}
