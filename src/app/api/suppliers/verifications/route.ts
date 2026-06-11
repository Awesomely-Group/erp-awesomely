import { authenticateRequest, unauthorized, json } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import type { VerificationStatus } from "@prisma/client";

export async function GET(req: Request): Promise<Response> {
  if (!(await authenticateRequest(req))) return unauthorized();

  const url = new URL(req.url);
  const status = url.searchParams.get("status") as VerificationStatus | null;
  const supplierId = url.searchParams.get("supplierId");
  const periodStart = url.searchParams.get("periodStart");
  const periodEnd = url.searchParams.get("periodEnd");

  const verifications = await prisma.supplierVerification.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(supplierId ? { supplierId } : {}),
      ...(periodStart ? { periodStart: { gte: new Date(periodStart) } } : {}),
      ...(periodEnd ? { periodEnd: { lte: new Date(periodEnd) } } : {}),
    },
    include: {
      supplier: { select: { id: true, name: true, isPartner: true } },
      role: { select: { name: true, ratePerHour: true } },
      invoice: { select: { id: true, number: true, totalEur: true, date: true } },
    },
    orderBy: [{ periodStart: "desc" }, { supplier: { name: "asc" } }],
  });

  return json({ data: verifications, total: verifications.length });
}
