import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request): Promise<NextResponse> {
  const isCron = process.env.CRON_SECRET &&
    req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  if (!isCron) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const company = await prisma.company.findFirst({ where: { active: true } });
  if (!company) return NextResponse.json({ error: "No company" }, { status: 404 });

  const key = company.holdedApiKey;

  async function tryEndpoint(url: string): Promise<{ status: number; isJson: boolean; sample: unknown }> {
    const res = await fetch(url, { headers: { key } });
    const text = await res.text();
    let parsed: unknown = null;
    let isJson = false;
    try { parsed = JSON.parse(text); isJson = true; } catch { /* html */ }
    const sample = isJson ? parsed : text.slice(0, 200);
    return { status: res.status, isJson, sample };
  }

  // Get a sample account ID from recent invoice products
  const invRes = await fetch("https://api.holded.com/api/invoicing/v1/documents/invoice?page=1", {
    headers: { key },
  });
  const invArr = await invRes.json() as Record<string, unknown>[];
  const sampleAccountId = (invArr[0]?.products as Record<string, unknown>[] | undefined)?.[0]?.account as string | undefined;

  const results: Record<string, unknown> = {
    sampleAccountId,
  };

  if (sampleAccountId) {
    results["GET /api/accounting/v1/account"] = await tryEndpoint(
      "https://api.holded.com/api/accounting/v1/account"
    );
    results[`GET /api/accounting/v1/account/${sampleAccountId}`] = await tryEndpoint(
      `https://api.holded.com/api/accounting/v1/account/${sampleAccountId}`
    );
    // Try getting a single invoice with full detail
    const firstInvoiceId = invArr[0]?.id as string | undefined;
    if (firstInvoiceId) {
      results[`GET /api/invoicing/v1/documents/invoice/${firstInvoiceId}`] = await tryEndpoint(
        `https://api.holded.com/api/invoicing/v1/documents/invoice/${firstInvoiceId}`
      );
    }
  }

  return NextResponse.json(results);
}
