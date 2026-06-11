import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { HoldedClient } from "@/lib/holded";
import { NextResponse } from "next/server";

export async function GET(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const q = searchParams.get("q") ?? "";

  if (!companyId) return NextResponse.json([]);

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { holdedApiKey: true },
  });
  if (!company) return NextResponse.json([]);

  const client = new HoldedClient(company.holdedApiKey);
  try {
    const contacts = await client.getClientContacts(q || undefined);
    return NextResponse.json(contacts);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
