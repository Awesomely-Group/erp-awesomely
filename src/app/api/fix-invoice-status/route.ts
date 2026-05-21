import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateInvoiceStatus } from "@/lib/sync";

const AUTO_CLASSIFIED_MARCAS = ["Awesomely", "Gigson"];

// One-time fix: recalculate status for invoices with Awesomely/Gigson marca that show as PENDING/PARTIAL
export async function POST(): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const candidates = await prisma.invoice.findMany({
    where: {
      status: { in: ["PENDING", "PARTIAL"] },
      OR: AUTO_CLASSIFIED_MARCAS.map((m) => ({
        OR: [
          { marca: m },
          { marca: { startsWith: `${m},` } },
          { marca: { contains: `,${m},` } },
          { marca: { endsWith: `,${m}` } },
        ],
      })),
    },
    select: { id: true, marca: true },
  });

  if (candidates.length === 0) {
    return NextResponse.json({ updated: 0 });
  }

  await Promise.all(candidates.map((inv) => updateInvoiceStatus(inv.id)));

  const updated = await prisma.invoice.findMany({
    where: { id: { in: candidates.map((i) => i.id) } },
    select: { id: true, marca: true, status: true },
  });

  const changed = updated.filter((inv) => inv.status !== "PENDING" && inv.status !== "PARTIAL");

  return NextResponse.json({
    candidates: candidates.length,
    updated: changed.length,
    results: updated.map((inv) => ({ id: inv.id, marca: inv.marca, status: inv.status })),
  });
}
