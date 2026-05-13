import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function tryFetch(url: string, apiKey: string): Promise<{
  url: string;
  status: number | null;
  ok: boolean;
  rawBody: string;
  parsed: unknown;
  error?: string;
}> {
  try {
    const res = await fetch(url, {
      headers: { key: apiKey, "Content-Type": "application/json" },
      next: { revalidate: 0 },
    });
    const text = await res.text();
    let parsed: unknown = null;
    try { parsed = JSON.parse(text); } catch { /* not JSON */ }
    return {
      url,
      status: res.status,
      ok: res.ok,
      rawBody: text.slice(0, 1000),
      parsed: Array.isArray(parsed)
        ? (parsed as unknown[]).slice(0, 3)
        : parsed,
    };
  } catch (err) {
    return {
      url,
      status: null,
      ok: false,
      rawBody: "",
      parsed: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const company = await prisma.company.findFirst({ where: { active: true } });
  if (!company) return NextResponse.json({ error: "No active company" }, { status: 404 });

  const key = company.holdedApiKey;

  // Find a real PURCHASE invoice with a holdedContactId to test with
  const sampleInvoice = await prisma.invoice.findFirst({
    where: { type: "PURCHASE", companyId: company.id, holdedContactId: { not: null } },
    select: { holdedContactId: true, counterparty: true },
  });

  const contactId = sampleInvoice?.holdedContactId ?? null;

  // Test individual contact endpoints with a real contactId
  const singleContactResults = contactId
    ? await Promise.all([
        tryFetch(`https://api.holded.com/api/invoicing/v1/contacts/${contactId}`, key),
        tryFetch(`https://api.holded.com/api/contacts/v1/contacts/${contactId}`, key),
      ])
    : [];

  return NextResponse.json({
    company: company.name,
    sampleContact: sampleInvoice ? { id: contactId, name: sampleInvoice.counterparty } : null,
    singleContactResults,
  });
}
