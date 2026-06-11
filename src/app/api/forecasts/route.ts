import { authenticateRequest, unauthorized, badRequest, json } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { ForecastType } from "@prisma/client";
import { auth } from "@/lib/auth";

export async function GET(req: Request): Promise<Response> {
  if (!(await authenticateRequest(req))) return unauthorized();

  const url = new URL(req.url);
  const marca = url.searchParams.get("marca");
  const type = url.searchParams.get("type") as ForecastType | null;
  const projectId = url.searchParams.get("projectId");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const forecasts = await prisma.forecast.findMany({
    where: {
      ...(marca ? { marca } : {}),
      ...(type ? { type } : {}),
      ...(projectId ? { projectId } : {}),
      ...(from || to
        ? {
            month: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    },
    include: {
      project: { select: { name: true, jiraKey: true } },
    },
    orderBy: [{ month: "asc" }, { type: "asc" }],
  });

  return json({ data: forecasts, total: forecasts.length });
}

export async function POST(req: Request): Promise<Response> {
  if (!(await authenticateRequest(req))) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Body JSON inválido");
  }

  const {
    month,
    type,
    marca = null,
    projectId = null,
    description = null,
    amountOptimistic,
    amountPessimistic,
  } = (body as Record<string, unknown>) ?? {};

  if (!month || typeof month !== "string") return badRequest("month es obligatorio (YYYY-MM)");
  if (!type || !Object.values(ForecastType).includes(type as ForecastType)) {
    return badRequest(`type inválido. Valores: ${Object.values(ForecastType).join(", ")}`);
  }
  if (typeof amountOptimistic !== "number" || typeof amountPessimistic !== "number") {
    return badRequest("amountOptimistic y amountPessimistic son obligatorios (número)");
  }

  const session = await auth();
  const createdBy = session?.user?.email ?? "api";

  const monthDate = new Date(`${month}-01T00:00:00.000Z`);

  const forecast = await prisma.forecast.create({
    data: {
      month: monthDate,
      type: type as ForecastType,
      marca: typeof marca === "string" ? marca : null,
      projectId: typeof projectId === "string" ? projectId : null,
      description: typeof description === "string" ? description : null,
      amountOptimistic,
      amountPessimistic,
      createdBy,
      updatedBy: createdBy,
    },
  });

  return json(forecast, 201);
}
