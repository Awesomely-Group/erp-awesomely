import { apiOk, apiRoute } from "@/lib/api/v1";
import { getCashBalance } from "@/lib/cash-balance";

/**
 * Saldo de caja y pendientes, por sociedad y consolidado.
 *
 * Permiso propio (`cash:read`, que exige ADMIN) y no `finance:read`: los KPIs son
 * agregados que ya circulan en informes, mientras que esto es cuánto hay y a quién se
 * le debe — exactamente el dato que quiere un fraude del CEO. Separarlos permite dar
 * "los números del mes" sin dar la tesorería.
 */
export const GET = apiRoute(async (request, ctx) => {
  const companyId = new URL(request.url).searchParams.get("companyId");

  return apiOk(
    await getCashBalance({ allowedCompanyIds: ctx.companyIds, companyId }),
  );
}, { scope: "cash:read" });
