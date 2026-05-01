import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// One-time cleanup: clear marca on invoices with no classified lines
export async function POST(): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Find invoices that have a marca set but no classifications on any of their lines
  const invoicesWithMarca = await prisma.invoice.findMany({
    where: { marca: { not: null } },
    select: {
      id: true,
      marca: true,
      lines: {
        select: {
          classification: { select: { id: true } },
        },
      },
    },
  });

  const toReset = invoicesWithMarca.filter((inv) =>
    inv.lines.every((l) => l.classification === null)
  );

  if (toReset.length === 0) {
    return NextResponse.json({ cleared: 0 });
  }

  await prisma.invoice.updateMany({
    where: { id: { in: toReset.map((i) => i.id) } },
    data: { marca: null },
  });

  return NextResponse.json({
    cleared: toReset.length,
    ids: toReset.map((i) => i.id),
  });
}
