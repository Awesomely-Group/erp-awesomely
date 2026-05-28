import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPLKPIs, getCashflowKPIs, getDerivedKPIs, getProjections, getAllKPIs } from "@/lib/kpis";
import type { KPIFilters } from "@/lib/kpis";

function parseFilters(url: URL): KPIFilters {
  const year = url.searchParams.get("year");
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  const companyId = url.searchParams.get("companyId") ?? undefined;
  const marca = url.searchParams.get("marca") ?? undefined;

  return {
    year: year ? parseInt(year, 10) : undefined,
    dateFrom: dateFrom ? new Date(dateFrom) : undefined,
    dateTo: dateTo ? new Date(dateTo) : undefined,
    companyId,
    marca,
  };
}

export async function GET(req: Request): Promise<NextResponse> {
  const session = await auth();
  const apiKey = req.headers.get("x-api-key");
  const envKey = process.env.ERP_API_KEY;

  const isSession = !!session;
  const isApiKey = !!envKey && apiKey === envKey;

  if (!isSession && !isApiKey) {
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
