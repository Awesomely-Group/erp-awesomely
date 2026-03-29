import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const HOLDED_BASE = "https://api.holded.com/api/invoicing/v1";

// Tests a single Holded document type endpoint and returns count + first item
async function testHoldedEndpoint(
  apiKey: string,
  type: string
): Promise<{ ok: boolean; count?: number; pageSize?: number; firstItem?: unknown; error?: string; rawBody?: string }> {
  try {
    const url = `${HOLDED_BASE}/documents/${type}?page=1`;
    const res = await fetch(url, {
      headers: { key: apiKey, "Content-Type": "application/json" },
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
    if (Array.isArray(parsed)) {
      return { ok: true, count: parsed.length, pageSize: parsed.length, firstItem: parsed[0] ?? null };
    }
    // Might be wrapped: { data: [...] } or { error: ... }
    return { ok: true, count: -1, rawBody: text.slice(0, 500), firstItem: parsed };
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

  // Test all Holded companies — test multiple purchase invoice endpoint names
  const holdedResults = await Promise.all(
    companies.map(async (c) => {
      const [invoice, bill, purchaseinvoice] = await Promise.all([
        testHoldedEndpoint(c.holdedApiKey, "invoice"),
        testHoldedEndpoint(c.holdedApiKey, "bill"),
        testHoldedEndpoint(c.holdedApiKey, "purchaseinvoice"),
      ]);
      return {
        company: c.name,
        invoice,
        bill,
        purchaseinvoice,
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
