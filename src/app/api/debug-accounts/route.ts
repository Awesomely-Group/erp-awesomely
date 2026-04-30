import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request): Promise<NextResponse> {
  const isCron = process.env.CRON_SECRET &&
    req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  if (!isCron) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const company = await prisma.company.findFirst({ where: { active: true } });
  if (!company) return NextResponse.json({ error: "No company" }, { status: 404 });

  const key = company.holdedApiKey;
  const sampleId = "68bffdd1300a62d5890b9347";

  async function probe(label: string, url: string, headers?: Record<string, string>): Promise<unknown> {
    const res = await fetch(url, { headers: { key, ...headers } });
    const text = await res.text();
    let json: unknown = null;
    try { json = JSON.parse(text); } catch { /* html */ }
    if (json !== null) return { status: res.status, ok: true, sample: Array.isArray(json) ? (json as unknown[]).slice(0, 1) : json };
    return { status: res.status, ok: false, preview: text.slice(0, 100) };
  }

  const results: Record<string, unknown> = {};

  await Promise.all([
    probe("invoicing/account", "https://api.holded.com/api/invoicing/v1/account").then(r => { results["invoicing/account"] = r; }),
    probe("invoicing/account/id", `https://api.holded.com/api/invoicing/v1/account/${sampleId}`).then(r => { results["invoicing/account/id"] = r; }),
    probe("accounting/ledger", "https://api.holded.com/api/accounting/v1/ledger").then(r => { results["accounting/ledger"] = r; }),
    probe("accounting/journal", "https://api.holded.com/api/accounting/v1/journal").then(r => { results["accounting/journal"] = r; }),
    probe("erp/v1/account", "https://api.holded.com/api/erp/v1/account").then(r => { results["erp/v1/account"] = r; }),
    // Try with Authorization header instead of key
    probe("accounting/account (Bearer)", "https://api.holded.com/api/accounting/v1/account", {
      Authorization: `Bearer ${key}`,
    }).then(r => { results["accounting/account-bearer"] = r; }),
  ]);

  return NextResponse.json(results);
}
