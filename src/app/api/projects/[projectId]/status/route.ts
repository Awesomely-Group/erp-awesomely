import { authenticateRequest, unauthorized, badRequest, notFound, json } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { ProjectStatus } from "@prisma/client";

const VALID_STATUSES = Object.values(ProjectStatus);

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
): Promise<Response> {
  if (!(await authenticateRequest(req))) return unauthorized();

  const { projectId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Body JSON inválido");
  }

  const status = (body as Record<string, unknown>)?.status;
  if (!status || !VALID_STATUSES.includes(status as ProjectStatus)) {
    return badRequest(
      `status inválido. Valores permitidos: ${VALID_STATUSES.join(", ")}`
    );
  }

  const project = await prisma.jiraProject.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  if (!project) return notFound("Proyecto no encontrado");

  const updated = await prisma.jiraProject.update({
    where: { id: projectId },
    data: { status: status as ProjectStatus },
    select: { id: true, jiraKey: true, name: true, status: true },
  });

  return json(updated);
}
