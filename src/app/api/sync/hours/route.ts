import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getProjectConsumption } from "@/lib/hour-buckets";

/**
 * Recalcula el consumo de todas las bolsas y lo deja en `HourBucketConsumption` /
 * `ProjectHoursSnapshot`, que es lo que lee el portal de cliente.
 *
 * Existe porque el portal no puede preguntar en caliente: `GET /api/v1/worklogs` de Giro
 * no pagina ni acepta límite —el rango de fechas es el único freno— y
 * `docs/consumo-api-holded.md` ya cuenta cómo acabó la última pelea por volumen de
 * llamadas. La pantalla interna sí sigue leyendo en vivo: el equipo quiere el dato
 * fresco y acepta esperar.
 */
export const maxDuration = 300;

async function handle(req: Request): Promise<NextResponse> {
  const session = await auth();
  const cronSecret = process.env.CRON_SECRET;
  const isCron = !!cronSecret && req.headers.get("authorization") === `Bearer ${cronSecret}`;
  if (!isCron && session === null) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Solo proyectos activos con alguna bolsa activa: el resto no tiene nada que calcular.
  const projects = await prisma.jiraProject.findMany({
    where: { active: true, hourBuckets: { some: { active: true } } },
    select: { id: true, name: true },
  });

  let ok = 0;
  const failed: { projectId: string; name: string; error: string }[] = [];

  for (const project of projects) {
    try {
      const consumption = await getProjectConsumption(project.id);
      if (consumption === null) continue;
      const computedAt = new Date();

      await prisma.$transaction([
        ...consumption.buckets.map((bucket) =>
          prisma.hourBucketConsumption.upsert({
            where: { bucketId: bucket.id },
            create: {
              bucketId: bucket.id,
              consumedHours: bucket.consumedHours,
              pendingApprovalHours: bucket.pendingApprovalHours,
              computedAt,
            },
            update: {
              consumedHours: bucket.consumedHours,
              pendingApprovalHours: bucket.pendingApprovalHours,
              computedAt,
            },
          }),
        ),
        prisma.projectHoursSnapshot.upsert({
          where: { projectId: project.id },
          create: {
            projectId: project.id,
            pendingAttributionHours: consumption.pendingAttributionHours,
            nonBillableHours: consumption.nonBillableHours,
            worklogFloorDate: consumption.worklogFloorDate,
            source: consumption.source,
            lastError: null,
            computedAt,
          },
          update: {
            pendingAttributionHours: consumption.pendingAttributionHours,
            nonBillableHours: consumption.nonBillableHours,
            worklogFloorDate: consumption.worklogFloorDate,
            source: consumption.source,
            lastError: null,
            computedAt,
          },
        }),
      ]);
      ok += 1;
    } catch (err) {
      // Un proyecto que falla no tumba la pasada, y sobre todo **no se escribe un cero**:
      // se deja la foto anterior y se anota el motivo. Un saldo de cero recién calculado
      // es indistinguible de "el cliente no ha consumido nada", que es la mentira más
      // cara que puede contar esta pantalla.
      const message = err instanceof Error ? err.message : "Error desconocido";
      failed.push({ projectId: project.id, name: project.name, error: message });
      await prisma.projectHoursSnapshot
        .updateMany({ where: { projectId: project.id }, data: { lastError: message } })
        .catch(() => { /* si ni eso se puede escribir, el error ya va en la respuesta */ });
    }
  }

  return NextResponse.json({ ok: true, projects: projects.length, updated: ok, failed });
}

export async function GET(req: Request): Promise<NextResponse> {
  return handle(req);
}

export async function POST(req: Request): Promise<NextResponse> {
  return handle(req);
}
