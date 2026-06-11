import { authenticateRequest, unauthorized, json } from "@/lib/api-auth";
import { getCashflowKPIs } from "@/lib/kpis";
import type { KPIFilters } from "@/lib/kpis";

export async function GET(req: Request): Promise<Response> {
  if (!(await authenticateRequest(req))) return unauthorized();

  const url = new URL(req.url);
  const year = url.searchParams.get("year");
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  const marca = url.searchParams.get("marca") ?? undefined;
  const companyId = url.searchParams.get("companyId") ?? undefined;

  const filters: KPIFilters = {
    year: year ? parseInt(year, 10) : undefined,
    dateFrom: dateFrom ? new Date(dateFrom) : undefined,
    dateTo: dateTo ? new Date(dateTo) : undefined,
    marca,
    companyId,
  };

  const cashflow = await getCashflowKPIs(filters);
  return json({ data: cashflow, generatedAt: new Date().toISOString() });
}
