import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request): Promise<NextResponse> {
  const isCron = process.env.CRON_SECRET &&
    req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  if (!isCron) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const company = await prisma.company.findFirst({ where: { active: true } });
  if (!company) return NextResponse.json({ error: "No company" }, { status: 404 });

  // Fetch accounting API as raw text to see exact response
  const accRes = await fetch("https://api.holded.com/api/accounting/v1/account", {
    headers: { key: company.holdedApiKey },
  });
  const accText = await accRes.text();
  let accParsed: unknown = null;
  try { accParsed = JSON.parse(accText); } catch { /* HTML or non-JSON */ }

  // Fetch a sample invoice to see raw product.account format
  const invRes = await fetch("https://api.holded.com/api/invoicing/v1/documents/invoice?page=1", {
    headers: { key: company.holdedApiKey },
  });
  const invText = await invRes.text();
  let invArr: Record<string, unknown>[] = [];
  try {
    const parsed = JSON.parse(invText);
    invArr = Array.isArray(parsed) ? parsed : [];
  } catch { /* ignore */ }

  const sampleProducts = (invArr[0]?.products as Record<string, unknown>[] | undefined)?.slice(0, 2) ?? [];

  return NextResponse.json({
    accountingStatus: accRes.status,
    accountingRaw: accText.slice(0, 500),
    accountingParsedCount: Array.isArray(accParsed) ? accParsed.length : null,
    accountingSample: Array.isArray(accParsed) ? (accParsed as unknown[]).slice(0, 2) : null,
    invoiceStatus: invRes.status,
    sampleProducts,
  });
}
