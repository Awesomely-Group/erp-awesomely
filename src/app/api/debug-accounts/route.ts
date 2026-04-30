import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request): Promise<NextResponse> {
  const isCron = process.env.CRON_SECRET &&
    req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  if (!isCron) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const companies = await prisma.company.findMany({ where: { active: true } });
  if (!companies.length) return NextResponse.json({ error: "No companies" }, { status: 404 });

  const results: Record<string, unknown> = {};

  for (const company of companies) {
    const key = company.holdedApiKey;
    const sampleId = "68bffdd1300a62d5890b9347";

    async function probe(url: string): Promise<unknown> {
      const res = await fetch(url, { headers: { key } });
      const text = await res.text();
      try {
        const json = JSON.parse(text);
        return { status: res.status, ok: true, sample: Array.isArray(json) ? (json as unknown[]).slice(0, 1) : json };
      } catch {
        return { status: res.status, ok: false, preview: text.slice(0, 80) };
      }
    }

    const companyResults: Record<string, unknown> = {};
    await Promise.all([
      probe(`https://api-ng.holded.com/api/accounting/v1/account`).then(r => { companyResults["api-ng/accounting/account"] = r; }),
      probe(`https://api-ng.holded.com/api/invoicing/v1/account/${sampleId}`).then(r => { companyResults["api-ng/invoicing/account/id"] = r; }),
      probe(`https://api.holded.com/api/accounting/v1/account/${sampleId}?key=${key}`).then(r => { companyResults["accounting/account/id?key=param"] = r; }),
      probe(`https://api.holded.com/api/invoicing/v1/products`).then(r => { companyResults["invoicing/products"] = r; }),
    ]);

    results[company.name] = companyResults;
  }

  return NextResponse.json(results);
}
