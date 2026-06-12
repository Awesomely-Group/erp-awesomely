import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const BASE = "https://api.holded.com/api/v2";

async function callHolded(
  apiKey: string,
  path: string,
  params: Record<string, string>
): Promise<{ status: number; raw: string; parsed: unknown }> {
  const url = new URL(`${BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${apiKey}` },
    next: { revalidate: 0 },
  });
  const raw = await res.text();
  let parsed: unknown = null;
  try { parsed = JSON.parse(raw); } catch { /* not JSON */ }
  return { status: res.status, raw: raw.slice(0, 800), parsed };
}

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const company = await prisma.company.findFirst({ where: { active: true } });
  if (!company) return NextResponse.json({ error: "No active company" }, { status: 404 });

  const key = company.holdedApiKey;

  // Test the exact same calls the sync makes
  const [
    limit5000,
    limit100,
    limit100page1,
    limit5000page1,
    noParams,
  ] = await Promise.all([
    callHolded(key, "/invoices", { limit: "5000" }),
    callHolded(key, "/invoices", { limit: "100" }),
    callHolded(key, "/invoices", { limit: "100", page: "1" }),
    callHolded(key, "/invoices", { limit: "5000", page: "1" }),
    callHolded(key, "/invoices", {}),
  ]);

  type WithItems = { items?: unknown[] };
  const countItems = (r: unknown): number => {
    if (Array.isArray(r)) return r.length;
    if (r && typeof r === "object" && Array.isArray((r as WithItems).items)) return (r as WithItems).items!.length;
    return -1;
  };

  return NextResponse.json({
    company: company.name,
    tests: {
      "limit=5000 (sync actual)":         { status: limit5000.status,     count: countItems(limit5000.parsed),     raw: limit5000.raw },
      "limit=100":                         { status: limit100.status,       count: countItems(limit100.parsed),       raw: limit100.raw },
      "limit=100&page=1 (debug-sync)":     { status: limit100page1.status,  count: countItems(limit100page1.parsed),  raw: limit100page1.raw },
      "limit=5000&page=1":                 { status: limit5000page1.status, count: countItems(limit5000page1.parsed), raw: limit5000page1.raw },
      "sin params":                        { status: noParams.status,       count: countItems(noParams.parsed),       raw: noParams.raw },
    },
  });
}
