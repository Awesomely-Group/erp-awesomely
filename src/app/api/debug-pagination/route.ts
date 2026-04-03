import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const HOLDED_BASE = "https://api.holded.com/api/invoicing/v1";

async function fetchPage(
  apiKey: string,
  type: string,
  page: number
): Promise<{ count: number; firstId: string | null; lastId: string | null; error?: string }> {
  try {
    const res = await fetch(`${HOLDED_BASE}/documents/${type}?page=${page}`, {
      headers: { key: apiKey, "Content-Type": "application/json" },
      next: { revalidate: 0 },
    });
    const text = await res.text();
    if (!res.ok) return { count: 0, firstId: null, lastId: null, error: `HTTP ${res.status}` };
    const parsed = JSON.parse(text) as Array<{ id: string }>;
    const arr = Array.isArray(parsed) ? parsed : ((parsed as { data?: Array<{ id: string }> }).data ?? []);
    return {
      count: arr.length,
      firstId: arr[0]?.id ?? null,
      lastId: arr[arr.length - 1]?.id ?? null,
    };
  } catch (err) {
    return { count: 0, firstId: null, lastId: null, error: String(err) };
  }
}

// Counts ALL pages for a given document type, detecting infinite loops
async function countAllPages(
  apiKey: string,
  type: string
): Promise<{
  pages: Array<{ page: number; count: number; firstId: string | null }>;
  totalItems: number;
  stoppedReason: string;
}> {
  const pages: Array<{ page: number; count: number; firstId: string | null }> = [];
  const seenFirstIds = new Set<string>();
  const MAX_PAGES = 20; // cap for this diagnostic endpoint

  for (let page = 1; page <= MAX_PAGES; page++) {
    const result = await fetchPage(apiKey, type, page);
    if (result.error || result.count === 0) {
      pages.push({ page, count: result.count, firstId: null });
      return {
        pages,
        totalItems: pages.slice(0, -1).reduce((s, p) => s + p.count, 0),
        stoppedReason: result.error ? `error: ${result.error}` : "empty_page",
      };
    }

    if (result.firstId && seenFirstIds.has(result.firstId)) {
      pages.push({ page, count: result.count, firstId: result.firstId });
      return {
        pages,
        totalItems: pages.slice(0, -1).reduce((s, p) => s + p.count, 0),
        stoppedReason: `INFINITE_LOOP_DETECTED — page ${page} has same firstId as a previous page (${result.firstId})`,
      };
    }

    if (result.firstId) seenFirstIds.add(result.firstId);
    pages.push({ page, count: result.count, firstId: result.firstId });
  }

  return {
    pages,
    totalItems: pages.reduce((s, p) => s + p.count, 0),
    stoppedReason: `reached_max_pages (${MAX_PAGES})`,
  };
}

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const companies = await prisma.company.findMany({ where: { active: true } });

  const results = await Promise.all(
    companies.map(async (c) => {
      const [invoicePagination, purchasePagination] = await Promise.all([
        countAllPages(c.holdedApiKey, "invoice"),
        countAllPages(c.holdedApiKey, "purchase"),
      ]);
      return {
        company: c.name,
        invoice: invoicePagination,
        purchase: purchasePagination,
      };
    })
  );

  return NextResponse.json(results, { status: 200 });
}
