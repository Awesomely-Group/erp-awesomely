import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const contactId = searchParams.get("contactId");
  if (!contactId) return NextResponse.json({ error: "contactId query param required" }, { status: 400 });

  const company = await prisma.company.findFirst({ where: { active: true } });
  if (!company) return NextResponse.json({ error: "No active company" }, { status: 404 });

  const res = await fetch(`https://api.holded.com/api/invoicing/v1/contacts/${contactId}`, {
    headers: { key: company.holdedApiKey, "Content-Type": "application/json" },
    next: { revalidate: 0 },
  });

  const text = await res.text();
  let parsed: unknown = null;
  try { parsed = JSON.parse(text); } catch { /* not JSON */ }

  return NextResponse.json({ status: res.status, contactId, raw: parsed ?? text });
}
