import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { HoldedClient, type AccountEntry } from "@/lib/holded";

// GET /api/holded/accounts?company=<companyId>
// Returns the chart of accounts for one or all active Holded companies.
export async function GET(req: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("company");

  const companies = await prisma.company.findMany({
    where: { active: true, ...(companyId ? { id: companyId } : {}) },
    select: { id: true, name: true, holdedApiKey: true },
    orderBy: { name: "asc" },
  });

  if (companies.length === 0) {
    return NextResponse.json({ error: "No active companies found" }, { status: 404 });
  }

  const results = await Promise.allSettled(
    companies.map(async (c) => {
      const client = new HoldedClient(c.holdedApiKey);
      const accounts: AccountEntry[] = await client.getAccounts();
      return { company: c.name, companyId: c.id, accounts };
    })
  );

  const data = results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : { company: companies[i].name, companyId: companies[i].id, error: (r.reason as Error).message }
  );

  return NextResponse.json(data.length === 1 ? data[0] : data);
}
