import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request): Promise<NextResponse> {
  const isCron = process.env.CRON_SECRET &&
    req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  if (!isCron) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const company = await prisma.company.findFirst({ where: { active: true } });
    if (!company) return NextResponse.json({ error: "No company" }, { status: 404 });

    const res = await fetch("https://api.holded.com/api/accounting/v1/account", {
      headers: { key: company.holdedApiKey },
    });
    const raw: unknown = await res.json();
    const arr = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];

    // Also fetch a raw invoice to see what product.account looks like
    const invRes = await fetch("https://api.holded.com/api/invoicing/v1/documents/invoice?page=1", {
      headers: { key: company.holdedApiKey },
    });
    const invRaw: unknown = await invRes.json();
    const invArr = Array.isArray(invRaw) ? (invRaw as Record<string, unknown>[]) : [];
    const sampleProducts = (invArr[0]?.products as Record<string, unknown>[] | undefined)?.slice(0, 2) ?? [];

    return NextResponse.json({
      accountingApiStatus: res.status,
      accountCount: arr.length,
      accountSample: arr.slice(0, 2),
      invoiceSampleProducts: sampleProducts,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
