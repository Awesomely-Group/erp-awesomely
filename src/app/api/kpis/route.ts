import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getPLKPIs,
  getCashflowKPIs,
  getDerivedKPIs,
  getProjections,
  getCommercialKPIs,
  getAllKPIs,
} from "@/lib/kpis";
import type { KPIFilters } from "@/lib/kpis";

function parseFilters(url: URL): KPIFilters {
  const year = url.searchParams.get("year");
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  const companyId = url.searchParams.get("companyId") ?? undefined;
  const marca = url.searchParams.get("marca") ?? undefined;
  const lineOfBusiness = url.searchParams.get("lineOfBusiness") ?? undefined;

  return {
    year: year ? parseInt(year, 10) : undefined,
    dateFrom: dateFrom ? new Date(dateFrom) : undefined,
    dateTo: dateTo ? new Date(dateTo) : undefined,
    companyId,
    marca,
    lineOfBusiness,
  };
}

/**
 * Ruta **interna** de la UI: solo sesión.
 *
 * Hasta ahora comparaba a mano contra `ERP_API_KEY` e ignoraba las claves de la base,
 * mientras el MCP servía exactamente los mismos KPIs con claves de la base: dos puertas
 * al mismo dato con reglas distintas, y la de aquí sin dueño, sin caducidad y sin
 * permisos. El acceso programático a los KPIs vive ahora en `/api/v1/kpis`, con el
 * scope `finance:read`.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "all";
  const filters = parseFilters(url);

  try {
    switch (type) {
      case "pl": {
        const pl = await getPLKPIs(filters);
        return NextResponse.json({ pl, generatedAt: new Date().toISOString() });
      }
      case "cashflow": {
        const cashflow = await getCashflowKPIs(filters);
        return NextResponse.json({ cashflow, generatedAt: new Date().toISOString() });
      }
      case "derived": {
        const derived = await getDerivedKPIs(filters);
        return NextResponse.json({ derived, generatedAt: new Date().toISOString() });
      }
      case "projections": {
        const projections = await getProjections(filters);
        return NextResponse.json({ projections, generatedAt: new Date().toISOString() });
      }
      case "commercial": {
        const commercial = await getCommercialKPIs(filters);
        return NextResponse.json({ commercial, generatedAt: new Date().toISOString() });
      }
      case "all":
      default: {
        const result = await getAllKPIs(filters);
        return NextResponse.json(result);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
