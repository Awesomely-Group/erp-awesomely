import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { invoiceWhereMarca } from "@/lib/org";
import type { Prisma } from "@prisma/client";

export async function GET(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const marca = searchParams.get("marca") ?? undefined;
  const companyId = searchParams.get("companyId") ?? undefined;
  const contactId = searchParams.get("contactId") ?? undefined;
  const q = searchParams.get("q")?.trim() ?? "";

  const where: Prisma.InvoiceWhereInput = {
    type: "SALE",
    ...invoiceWhereMarca(marca),
    // Without a companyId this would return invoices across ALL companies — always scope
    // when the caller knows which company it's searching within (e.g. linking a proforma
    // to one of its own company's invoices).
    ...(companyId ? { companyId } : {}),
    ...(contactId ? { holdedContactId: contactId } : {}),
  };

  if (q) {
    where.OR = [
      { number: { contains: q, mode: "insensitive" } },
      { counterparty: { contains: q, mode: "insensitive" } },
    ];
  }

  const invoices = await prisma.invoice.findMany({
    where,
    select: {
      id: true,
      number: true,
      counterparty: true,
      date: true,
      totalEur: true,
      marca: true,
    },
    orderBy: { date: "desc" },
    take: 50,
  });

  return NextResponse.json(
    invoices.map((inv) => ({
      id: inv.id,
      number: inv.number,
      counterparty: inv.counterparty,
      date: inv.date.toISOString().slice(0, 10),
      totalEur: Number(inv.totalEur),
      marca: inv.marca,
    }))
  );
}
