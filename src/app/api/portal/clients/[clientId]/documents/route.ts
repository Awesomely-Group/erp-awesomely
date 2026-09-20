import { authenticatePortalRequest } from "@/lib/portal-auth";
import { getPortalDocuments, PORTAL_DOCUMENTS_MAX_LIMIT } from "@/lib/portal-data";
import { json, notFound, unauthorized } from "@/lib/api-auth";

/**
 * Facturas y proformas de un cliente, en una sola llamada porque el portal las pinta en
 * la misma sección y dos viajes doblarían la latencia de la página.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ clientId: string }> },
): Promise<Response> {
  const url = new URL(request.url);
  const brand = url.searchParams.get("brand");
  if (!authenticatePortalRequest(request, brand)) return unauthorized();

  const rawLimit = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : PORTAL_DOCUMENTS_MAX_LIMIT;

  const { clientId } = await params;
  const data = await getPortalDocuments(brand, clientId, limit);
  if (data === null) return notFound("Cliente no encontrado");

  return json(data);
}
