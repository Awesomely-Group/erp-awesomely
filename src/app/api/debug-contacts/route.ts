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

  // Try different URL combinations to find which one works
  const candidates = [
    "https://api.holded.com/api/contacts/v1/contacts",
    "https://api.holded.com/api/contacts/v1/contacts?type=supplier",
    "https://api.holded.com/api/contacts/v1/contacts?type=proveedor",
    "https://api.holded.com/api/contacts/v2/contacts",
    "https://api.holded.com/api/contacts/v2/contacts?type=supplier",
    "https://api.holded.com/api/invoicing/v1/contacts",
    "https://api.holded.com/api/invoicing/v1/contacts?type=supplier",
  ];

  const results = await Promise.all(candidates.map((url) => tryFetch(url, key)));

  return NextResponse.json({
    company: company.name,
    results,
  });
}
