import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const HOLDED_BASE = "https://api.holded.com/api/invoicing/v1";

type HoldedPageResult = {
  ok: boolean;
  count?: number;
  firstId?: string;
  error?: string;
  rawBody?: string;
};

async function fetchHoldedPage(apiKey: string, type: string, page: number): Promise<HoldedPageResult> {
  try {
    const url = `${HOLDED_BASE}/documents/${type}?page=${page}`;
    const res = await fetch(url, {
      headers: { key: apiKey, "Content-Type": "application/json" },
      next: { revalidate: 0 },
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}`, rawBody: text.slice(0, 300) };
    }
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch {
      return { ok: false, error: "Invalid JSON", rawBody: text.slice(0, 300) };
    }
    const arr: Array<{ id?: string }> = Array.isArray(parsed)
      ? (parsed as Array<{ id?: string }>)
      : ((parsed as { data?: Array<{ id?: string }> }).data ?? []);
    return { ok: true, count: arr.length, firstId: arr[0]?.id ?? undefined };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// Tests a Holded endpoint across multiple pages to diagnose pagination behavior
async function testHoldedEndpoint(
  apiKey: string,
  type: string
): Promise<{
  ok: boolean;
  page1?: HoldedPageResult;
  page2?: HoldedPageResult;
  page3?: HoldedPageResult;
  page999?: HoldedPageResult;
  paginationBehavior?: string;
  error?: string;
  rawBody?: string;
}> {
  try {
    // Fetch pages 1, 2, 3 and a high page in parallel to diagnose pagination
    const [page1, page2, page3, page999] = await Promise.all([
      fetchHoldedPage(apiKey, type, 1),
      fetchHoldedPage(apiKey, type, 2),
      fetchHoldedPage(apiKey, type, 3),
      fetchHoldedPage(apiKey, type, 999),
    ]);

    if (!page1.ok) return { ok: false, error: page1.error, rawBody: page1.rawBody };

    // Diagnose pagination behavior
    let paginationBehavior: string;
    if (page1.count === 0) {
      paginationBehavior = "no_data";
    } else if (page999.ok && (page999.count ?? 0) > 0 && page999.firstId === page1.firstId) {
      paginationBehavior = "INFINITE_LOOP — page 999 returns same data as page 1 (no real pagination)";
    } else if (page2.ok && (page2.count ?? 0) > 0 && page2.firstId === page1.firstId) {
      paginationBehavior = "INFINITE_LOOP — page 2 returns same data as page 1";
    } else if (page2.ok && (page2.count ?? 0) > 0 && page2.firstId !== page1.firstId) {
      paginationBehavior = "pagination_ok — page 2 has different items than page 1";
    } else if (page2.ok && (page2.count ?? 0) === 0) {
      paginationBehavior = "single_page — page 2 is empty (all data fits in page 1)";
    } else {
      paginationBehavior = "unknown";
    }

    return { ok: true, page1, page2, page3, page999, paginationBehavior };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// Tests Jira /project/search endpoint
async function testJiraEndpoint(
  domain: string,
  email: string,
  apiToken: string
): Promise<{ ok: boolean; projectCount?: number; isLast?: boolean; error?: string; rawBody?: string }> {
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const baseUrl = `https://${cleanDomain}/rest/api/3`;
  const authHeader = `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`;

  try {
    const res = await fetch(`${baseUrl}/project/search?startAt=0&maxResults=10`, {
      headers: { Authorization: authHeader, "Content-Type": "application/json", Accept: "application/json" },
      next: { revalidate: 0 },
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}`, rawBody: text.slice(0, 500) };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, error: "Invalid JSON", rawBody: text.slice(0, 500) };
    }
    const p = parsed as { values?: unknown[]; total?: number; isLast?: boolean };
    return {
      ok: true,
      projectCount: p.values?.length ?? -1,
      isLast: p.isLast,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [companies, workspaces] = await Promise.all([
    prisma.company.findMany({ where: { active: true } }),
    prisma.jiraWorkspace.findMany({ where: { active: true } }),
  ]);

  // Test all Holded companies — check pagination behavior for invoice and purchase
  const holdedResults = await Promise.all(
    companies.map(async (c) => {
      const [invoice, purchase] = await Promise.all([
        testHoldedEndpoint(c.holdedApiKey, "invoice"),
        testHoldedEndpoint(c.holdedApiKey, "purchase"),
      ]);
      return {
        company: c.name,
        invoice,
        purchase,
      };
    })
  );

  // Test all Jira workspaces
  const jiraResults = await Promise.all(
    workspaces.map(async (w) => {
      const result = await testJiraEndpoint(w.domain, w.email, w.apiToken);
      return {
        workspace: w.name,
        domain: w.domain,
        domainNormalized: w.domain.replace(/^https?:\/\//, "").replace(/\/$/, ""),
        email: w.email,
        result,
      };
    })
  );

  return NextResponse.json({ holded: holdedResults, jira: jiraResults }, { status: 200 });
}
