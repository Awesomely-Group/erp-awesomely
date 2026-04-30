import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const company = await prisma.company.findFirst({ where: { active: true } });
  if (!company) return NextResponse.json({ error: "No company" }, { status: 404 });

  // Fetch raw accounting accounts to inspect the actual field names
  const res = await fetch("https://api.holded.com/api/accounting/v1/account", {
    headers: { key: company.holdedApiKey },
    next: { revalidate: 0 },
  });
  const raw: unknown = await res.json();

  const arr = Array.isArray(raw) ? raw : [];
  return NextResponse.json({
    status: res.status,
    count: arr.length,
    sample: arr.slice(0, 3),
    // Also check a sample invoice line to see what account format it uses
    sampleLines: await prisma.invoiceLine.findMany({
      where: { accountingAccount: { not: null } },
      select: { accountingAccount: true, accountingAccountName: true },
      take: 3,
    }),
  });
}
