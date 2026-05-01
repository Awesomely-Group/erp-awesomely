import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request): Promise<NextResponse> {
  const isCron = process.env.CRON_SECRET &&
    req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  if (!isCron) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Show what's actually in the DB for accountingAccount fields
  const withAccount = await prisma.invoiceLine.count({
    where: { accountingAccount: { not: null } },
  });
  const withName = await prisma.invoiceLine.count({
    where: { accountingAccountName: { not: null } },
  });
  const total = await prisma.invoiceLine.count();

  const samples = await prisma.invoiceLine.findMany({
    where: { accountingAccount: { not: null } },
    select: { accountingAccount: true, accountingAccountName: true },
    take: 5,
  });

  // Check what Holded actually sends for product.account on both invoice types
  const company = await prisma.company.findFirst({ where: { active: true } });
  let holdedSamples: unknown = null;
  if (company) {
    const res = await fetch(
      `https://api.holded.com/api/invoicing/v1/documents/purchase?page=1`,
      { headers: { key: company.holdedApiKey } }
    );
    const arr = await res.json() as Record<string, unknown>[];
    holdedSamples = arr.slice(0, 2).map(inv => ({
      id: inv.id,
      products: (inv.products as Record<string, unknown>[] | undefined)?.slice(0, 1).map(p => ({
        name: p.name,
        account: p.account,
        accountType: typeof p.account,
      })),
    }));
  }

  return NextResponse.json({ total, withAccount, withName, samples, holdedSamples });
}
