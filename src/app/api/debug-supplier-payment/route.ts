import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function tryFetch(url: string, key: string): Promise<{ url: string; status: number | null; raw: unknown; error?: string }> {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      next: { revalidate: 0 },
    });
    const text = await res.text();
    let parsed: unknown = null;
    try { parsed = JSON.parse(text); } catch { /* not JSON */ }
    return { url, status: res.status, raw: parsed ?? text };
  } catch (err) {
    return { url, status: null, raw: null, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function GET(req: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const contactId = searchParams.get("contactId");
  if (!contactId) return NextResponse.json({ error: "contactId query param required" }, { status: 400 });

  const company = await prisma.company.findFirst({ where: { active: true } });
  if (!company) return NextResponse.json({ error: "No active company" }, { status: 404 });

  const key = company.holdedApiKey;

  const [invoicingResult, contactsResult, listSample] = await Promise.all([
    tryFetch(`https://api.holded.com/api/v2/contacts/${contactId}`, key),
    tryFetch(`https://api.holded.com/api/v2/contacts/${contactId}`, key),
    tryFetch(`https://api.holded.com/api/v2/contacts?limit=10&offset=0`, key),
  ]);

  // Show full raw objects to reveal nested fields like defaults.payment_method
  const listPaymentMethods = Array.isArray(listSample.raw)
    ? (listSample.raw as Array<Record<string, unknown>>).slice(0, 3)
    : listSample.raw;

  return NextResponse.json({
    contactId,
    invoicingV1: invoicingResult,
    contactsV1: contactsResult,
    listSample: { url: listSample.url, status: listSample.status, firstContacts: listPaymentMethods },
  });
}
