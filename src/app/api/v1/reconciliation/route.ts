import { apiError, apiOk, apiRoute, dateParam } from "@/lib/api/v1";
import { getHourlyReconciliation } from "@/lib/reconciliation";

/**
 * Horas aprobadas en Giro frente a lo facturado, proyecto a proyecto.
 *
 * El rango es obligatorio: sin acotar, esto cruza el histórico entero contra la API de
 * Giro, proyecto por proyecto.
 */
export const GET = apiRoute(async (request) => {
  const url = new URL(request.url);

  const desde = dateParam(url, "from");
  if (desde instanceof Response) return desde;
  const hasta = dateParam(url, "to");
  if (hasta instanceof Response) return hasta;

  if (!desde || !hasta) {
    return apiError(400, "bad_request", "Hacen falta `from` y `to` en formato YYYY-MM-DD");
  }
  if (hasta < desde) return apiError(400, "bad_request", "`to` es anterior a `from`");

  return apiOk(await getHourlyReconciliation(desde, hasta));
}, { scope: "finance:read" });
