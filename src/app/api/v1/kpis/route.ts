import { apiError, apiOk, apiRoute, dateParam } from "@/lib/api/v1";
import { getAllKPIs } from "@/lib/kpis";

/**
 * KPIs agregados: P&L, flujo de caja, derivados, proyecciones y embudo comercial.
 *
 * Pide `finance:read` y **no** `cash:read`: son cifras agregadas, de las que ya
 * circulan en informes. El saldo de tesorería y los pagos individuales viven en
 * `/cash-balance` con su propio permiso, porque son otra cosa — es el dato que busca un
 * fraude del CEO, no el que se enseña en un comité.
 *
 * Sustituye a `/api/kpis`, que comparaba a mano contra `ERP_API_KEY` e ignoraba las
 * claves de la base: los mismos datos salían por dos puertas con reglas distintas.
 */
export const GET = apiRoute(async (request, ctx) => {
  const url = new URL(request.url);

  const desde = dateParam(url, "dateFrom");
  if (desde instanceof Response) return desde;
  const hasta = dateParam(url, "dateTo");
  if (hasta instanceof Response) return hasta;

  const yearRaw = url.searchParams.get("year");
  const year = yearRaw === null ? undefined : Number(yearRaw);
  if (year !== undefined && (!Number.isInteger(year) || year < 2020 || year > 2040)) {
    return apiError(400, "bad_request", "`year` tiene que ser un año entre 2020 y 2040");
  }

  // La sociedad y la marca que pida el cliente solo pueden acotar dentro de lo que la
  // credencial alcanza. Si está acotada a una sola, esa manda y el parámetro se ignora.
  const companyId =
    ctx.companyIds.length === 1
      ? ctx.companyIds[0]
      : (url.searchParams.get("companyId") ?? undefined);
  const marca =
    ctx.marcas.length === 1 ? ctx.marcas[0] : (url.searchParams.get("marca") ?? undefined);

  if (companyId && companyId !== "consolidated" && ctx.companyIds.length > 0 && !ctx.companyIds.includes(companyId)) {
    return apiError(404, "not_found", "Esa sociedad no existe");
  }

  const kpis = await getAllKPIs({
    ...(year === undefined ? {} : { year }),
    ...(desde ? { dateFrom: desde } : {}),
    ...(hasta ? { dateTo: hasta } : {}),
    ...(companyId ? { companyId } : {}),
    ...(marca ? { marca } : {}),
    ...(url.searchParams.get("lineOfBusiness")
      ? { lineOfBusiness: url.searchParams.get("lineOfBusiness")! }
      : {}),
  });

  return apiOk(kpis);
}, { scope: "finance:read" });
