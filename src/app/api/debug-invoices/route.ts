import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [count, sample, companies] = await Promise.all([
      prisma.invoice.count(),
      prisma.invoice.findMany({
        take: 2,
        include: { company: true, _count: { select: { lines: true } } },
        orderBy: { date: "desc" },
      }),
      prisma.company.findMany({ where: { active: true } }),
    ]);

    return NextResponse.json({
      ok: true,
      count,
      companies: companies.map((c) => ({ id: c.id, name: c.name })),
      sample: sample.map((inv) => ({
        id: inv.id,
        number: inv.number,
        type: inv.type,
        status: inv.status,
        date: inv.date,
        totalEur: Number(inv.totalEur),
        company: inv.company.name,
        lineCount: inv._count.lines,
      })),
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
  }
}
