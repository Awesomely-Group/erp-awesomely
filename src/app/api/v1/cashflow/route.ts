import { apiOk, apiRoute, dateParam } from "@/lib/api/v1";
import { getCashflowKPIs } from "@/lib/kpis";

/** Flujo de caja agregado. Mismo criterio de permisos que `/kpis`. */
export const GET = apiRoute(async (request, ctx) => {
  const url = new URL(request.url);

  const desde = dateParam(url, "dateFrom");
  if (desde instanceof Response) return desde;
  const hasta = dateParam(url, "dateTo");
  if (hasta instanceof Response) return hasta;

  const yearRaw = url.searchParams.get("year");
  const companyId =
    ctx.companyIds.length === 1 ? ctx.companyIds[0] : (url.searchParams.get("companyId") ?? undefined);
  const marca = ctx.marcas.length === 1 ? ctx.marcas[0] : (url.searchParams.get("marca") ?? undefined);

  const cashflow = await getCashflowKPIs({
    ...(yearRaw ? { year: Number(yearRaw) } : {}),
    ...(desde ? { dateFrom: desde } : {}),
    ...(hasta ? { dateTo: hasta } : {}),
    ...(companyId ? { companyId } : {}),
    ...(marca ? { marca } : {}),
  });

  return apiOk(cashflow);
}, { scope: "finance:read" });
