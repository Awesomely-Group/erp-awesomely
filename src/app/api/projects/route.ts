import { authenticateRequest, unauthorized, json } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import type { ProjectStatus } from "@prisma/client";

export async function GET(req: Request): Promise<Response> {
  if (!(await authenticateRequest(req))) return unauthorized();

  const url = new URL(req.url);
  const status = url.searchParams.get("status") as ProjectStatus | null;
  const type = url.searchParams.get("type"); // "precio_cerrado" | "bolsas_horas" | "fee_regular"

  const projects = await prisma.jiraProject.findMany({
    where: {
      active: true,
      ...(status ? { status } : {}),
      ...(type === "precio_cerrado" ? { isPrecioCerrado: true } : {}),
      ...(type === "bolsas_horas" ? { isBolsasHoras: true } : {}),
      ...(type === "fee_regular" ? { isFeeRegular: true } : {}),
    },
    select: {
      id: true,
      jiraKey: true,
      name: true,
      status: true,
      isPrecioCerrado: true,
      isBolsasHoras: true,
      isFeeRegular: true,
      workspace: { select: { name: true } },
      _count: { select: { budgets: true, hourBuckets: true } },
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });

  return json({ data: projects, total: projects.length });
}
