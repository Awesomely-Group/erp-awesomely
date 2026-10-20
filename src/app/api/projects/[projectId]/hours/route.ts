/**
 * Las horas de un proyecto, en los dos cortes que de verdad pinta alguna pantalla
 * (Bloque E, 3/3).
 *
 * Sustituye a `/api/tempo/worklogs`, que servía seis `groupBy` de los cuales solo dos
 * tenían consumidor: `month-cost` (gráfica del dashboard de proyecto, dashboard por
 * tipo y tabla de proyectos) y `hierarchical` (pestaña Timesheet). Los otros cuatro
 * —`issue`, `issue-debug`, `worklog` y `month`— no los llamaba nadie y se van con la
 * ruta vieja en vez de arrastrarse a una fuente nueva.
 *
 * **El coste se calcula aquí, con las tarifas del ERP.** Giro también sabe calcularlo
 * (`/api/v1/project-cost`), pero con su catálogo de tarifas, que es la tarifa interna;
 * lo que estas pantallas enseñan es el coste de proveedor
 * (`Supplier.hourlyRate` / `ProjectUserRole.ratePerHour`). Son dos números distintos y
 * ninguno sustituye al otro: `project-cost` se queda para la conciliación.
 *
 * `source` viaja en las dos respuestas. Un proyecto sin vincular a Giro y con Tempo ya
 * apagado devuelve `UNAVAILABLE` con las listas vacías, y la pantalla tiene que decir
 * "sin vincular" en vez de pintar un cero que parece un dato.
 */
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { projectWorklogs, type HoursSource, type WorklogLinea } from "@/lib/hours-source";
import { NextResponse } from "next/server";

const redondea = (n: number): number => Math.round(n * 100) / 100;

export interface MonthCost {
  month: string;
  totalHours: number;
  totalCost: number;
}

export interface ProjectHoursMonthCostResponse {
  source: HoursSource;
  months: MonthCost[];
  totalHours: number;
  totalCost: number;
  estimateHours: number | null;
  estimateCost: number | null;
}

export interface WorklogDetail {
  description: string;
  issueKey: string;
  hours: number;
}

export interface IssueWithWorklogs {
  issueKey: string;
  /** Id numérico de Jira, o `null` cuando las horas vienen de Giro. */
  jiraIssueId: number | null;
  summary: string;
  totalHours: number;
  originalEstimateHours: number | null;
  worklogs: WorklogDetail[];
  actualCostEur: number;
  estimatedCostEur: number | null;
  hourBucketId?: string;
}

export interface UserWithIssues {
  accountId: string;
  displayName: string;
  totalHours: number;
  ratePerHour: number;
  actualCostEur: number;
  estimatedCostEur: number | null;
  issues: IssueWithWorklogs[];
}

export interface ProjectHoursHierarchicalResponse {
  source: HoursSource;
  users: UserWithIssues[];
  totalHours: number;
  totalEstimateHours: number;
  totalActualCostEur: number;
  totalEstimatedCostEur: number;
  /**
   * Personas cuyas horas llegaron sin `accountId` al otro lado del puente: cuentan en
   * el total pero no encuentran tarifa, así que salen a 0 €. Se enseña, no se calla.
   */
  sinPuente: string[];
}

/**
 * La tarifa de una persona en este proyecto, en el orden de siempre: lo que diga el
 * proyecto, luego el rol por defecto de su proveedor, luego la tarifa suelta del
 * proveedor, y 0 si no hay nada — que es "sin tarifa", no "gratis", y por eso se ve.
 */
async function tarifas(
  projectId: string,
  accountIds: string[],
): Promise<(accountId: string) => number> {
  const [suppliers, overrides] = await Promise.all([
    prisma.supplier.findMany({
      where: { jiraUsers: { some: { accountId: { in: accountIds } } } },
      select: {
        jiraUsers: { select: { accountId: true } },
        hourlyRate: true,
        defaultRole: { select: { ratePerHour: true } },
      },
    }),
    prisma.projectUserRole.findMany({
      where: { projectId, jiraAccountId: { in: accountIds } },
      select: { jiraAccountId: true, ratePerHour: true },
    }),
  ]);

  const porProveedor = new Map<string, (typeof suppliers)[number]>();
  for (const supplier of suppliers) {
    for (const usuario of supplier.jiraUsers) porProveedor.set(usuario.accountId, supplier);
  }
  const porProyecto = new Map(
    overrides
      .filter((fila) => fila.ratePerHour != null)
      .map((fila) => [fila.jiraAccountId, Number(fila.ratePerHour)]),
  );

  return (accountId: string): number => {
    const override = porProyecto.get(accountId);
    if (override != null) return override;
    const supplier = porProveedor.get(accountId);
    if (supplier?.defaultRole) return Number(supplier.defaultRole.ratePerHour);
    if (supplier?.hourlyRate) return Number(supplier.hourlyRate);
    return 0;
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { projectId } = await params;
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const groupBy = searchParams.get("groupBy") ?? "month-cost";

    if (!from || !to) return NextResponse.json({ error: "Missing from or to" }, { status: 400 });
    if (groupBy !== "month-cost" && groupBy !== "hierarchical") {
      return NextResponse.json({ error: `groupBy no soportado: ${groupBy}` }, { status: 400 });
    }

    const project = await prisma.jiraProject.findUnique({
      where: { id: projectId },
      include: { workspace: true },
    });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const { source, worklogs, issues, nombres, sinPuente } = await projectWorklogs(project, {
      from,
      to,
    });

    const accountIds = [...new Set(worklogs.map((linea) => linea.accountId))];
    const rateDe = await tarifas(project.id, accountIds);

    if (groupBy === "month-cost") {
      const porMes = new Map<string, { seconds: number; cost: number }>();
      for (const linea of worklogs) {
        const mes = linea.date.slice(0, 7);
        const acumulado = porMes.get(mes) ?? { seconds: 0, cost: 0 };
        porMes.set(mes, {
          seconds: acumulado.seconds + linea.seconds,
          cost: acumulado.cost + (linea.seconds / 3600) * rateDe(linea.accountId),
        });
      }

      const months: MonthCost[] = [...porMes.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, datos]) => ({
          month,
          totalHours: redondea(datos.seconds / 3600),
          totalCost: redondea(datos.cost),
        }));

      const totalHours = redondea(months.reduce((suma, mes) => suma + mes.totalHours, 0));
      const totalCost = redondea(months.reduce((suma, mes) => suma + mes.totalCost, 0));

      // La estimación es la de los issues **con horas en el rango**, no la del proyecto
      // entero: es la comparación que tiene sentido contra lo imputado.
      const estimadoSegundos = [...issues.values()].reduce(
        (suma, issue) => suma + (issue.originalEstimateSeconds ?? 0),
        0,
      );
      const estimateHours = estimadoSegundos > 0 ? redondea(estimadoSegundos / 3600) : null;
      // Se valora a la tarifa media real del periodo: no hay forma de saber quién habría
      // hecho las horas estimadas.
      const estimateCost =
        estimateHours != null && totalHours > 0
          ? redondea(estimateHours * (totalCost / totalHours))
          : null;

      return NextResponse.json({
        source,
        months,
        totalHours,
        totalCost,
        estimateHours,
        estimateCost,
      } satisfies ProjectHoursMonthCostResponse);
    }

    const asignaciones = await prisma.issueHourBucketAssignment.findMany({
      where: { projectId: project.id },
      select: { issueKey: true, hourBucketId: true },
    });
    const bolsaDe = new Map(asignaciones.map((fila) => [fila.issueKey, fila.hourBucketId]));

    // persona → issue → sus líneas
    const porPersona = new Map<string, Map<string, WorklogLinea[]>>();
    for (const linea of worklogs) {
      let porIssue = porPersona.get(linea.accountId);
      if (!porIssue) {
        porIssue = new Map();
        porPersona.set(linea.accountId, porIssue);
      }
      const lineas = porIssue.get(linea.issueKey);
      if (lineas) lineas.push(linea);
      else porIssue.set(linea.issueKey, [linea]);
    }

    const users: UserWithIssues[] = [...porPersona.entries()]
      .map(([accountId, porIssue]) => {
        const rate = rateDe(accountId);

        const deLaPersona: IssueWithWorklogs[] = [...porIssue.entries()]
          .map(([issueKey, lineas]) => {
            const meta = issues.get(issueKey);
            const totalHours = redondea(
              lineas.reduce((suma, linea) => suma + linea.seconds, 0) / 3600,
            );
            const originalEstimateHours =
              meta?.originalEstimateSeconds != null
                ? redondea(meta.originalEstimateSeconds / 3600)
                : null;

            return {
              issueKey,
              jiraIssueId: lineas[0]!.issueNumericId,
              summary: meta?.summary ?? issueKey,
              totalHours,
              originalEstimateHours,
              worklogs: lineas.map((linea) => ({
                description: linea.description || "—",
                issueKey,
                hours: redondea(linea.seconds / 3600),
              })),
              actualCostEur: redondea(totalHours * rate),
              estimatedCostEur:
                originalEstimateHours != null ? redondea(originalEstimateHours * rate) : null,
              hourBucketId: bolsaDe.get(issueKey),
            };
          })
          .sort((a, b) => a.issueKey.localeCompare(b.issueKey));

        const conEstimacion = deLaPersona.filter((issue) => issue.estimatedCostEur != null);

        return {
          accountId,
          displayName: nombres.get(accountId) ?? accountId,
          totalHours: redondea(deLaPersona.reduce((suma, issue) => suma + issue.totalHours, 0)),
          ratePerHour: rate,
          actualCostEur: redondea(
            deLaPersona.reduce((suma, issue) => suma + issue.actualCostEur, 0),
          ),
          estimatedCostEur:
            conEstimacion.length > 0
              ? redondea(
                  conEstimacion.reduce((suma, issue) => suma + (issue.estimatedCostEur ?? 0), 0),
                )
              : null,
          issues: deLaPersona,
        };
      })
      .sort((a, b) => b.totalHours - a.totalHours);

    // La estimación se cuenta **una vez por issue**, aunque hayan imputado tres personas.
    const estimacionPorIssue = new Map<string, number>();
    for (const usuario of users) {
      for (const issue of usuario.issues) {
        estimacionPorIssue.set(issue.issueKey, issue.originalEstimateHours ?? 0);
      }
    }

    return NextResponse.json({
      source,
      users,
      totalHours: redondea(users.reduce((suma, usuario) => suma + usuario.totalHours, 0)),
      totalEstimateHours: redondea(
        [...estimacionPorIssue.values()].reduce((suma, horas) => suma + horas, 0),
      ),
      totalActualCostEur: redondea(
        users.reduce((suma, usuario) => suma + usuario.actualCostEur, 0),
      ),
      totalEstimatedCostEur: redondea(
        users.reduce((suma, usuario) => suma + (usuario.estimatedCostEur ?? 0), 0),
      ),
      sinPuente,
    } satisfies ProjectHoursHierarchicalResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
