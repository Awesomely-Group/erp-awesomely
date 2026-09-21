/**
 * Consumo de las bolsas de un proyecto: carga lo que hace falta, pide las horas a la
 * fuente que corresponda y delega el reparto en `hour-bucket-consumption.ts`.
 *
 * Es el **único** sitio donde se calcula esto. Lo usan la pantalla interna del proyecto
 * (en caliente, el equipo quiere el dato fresco) y el cron que alimenta el portal de
 * cliente; si cada uno tuviera su copia acabaríamos enseñando al cliente una cifra
 * distinta de la nuestra.
 */
import { prisma } from "./prisma";
import { GiroClient, type GiroWorklog } from "./giro-client";
import { TempoClient } from "./tempo";
import {
  computeBucketConsumption,
  round2,
  type ConsumptionResult,
  type ConsumptionWorklog,
} from "./hour-bucket-consumption";

/** De dónde salieron las horas. Durante la convivencia Jira/Giro importa saberlo. */
export type HoursSource = "GIRO" | "TEMPO";

/**
 * Desde cuándo pedir partes: **siempre desde el principio**.
 *
 * Arrancaba en la fecha de la bolsa más antigua, para no pedirle a Giro todo el
 * histórico en un endpoint que no pagina. Era una optimización prematura y costaba
 * corrección: las horas anteriores a la primera bolsa **no se pedían**, así que no
 * llegaban ni a contarse como "sin repartir" — desaparecían en silencio, que es justo
 * lo que este cálculo promete no hacer.
 *
 * No era teórico: Z1 Gestión tenía 31 de sus 37 h imputadas antes de su primera bolsa
 * (trabajo de principios de mayo; la bolsa se dio de alta el día 18) y el ERP solo veía
 * 6. Y trabajar antes de facturar el pack es lo normal, no la excepción, así que el caso
 * se repetiría en cualquier cliente.
 *
 * El coste real de quitarlo es despreciable: el proyecto más grande de Giro ronda los
 * cientos de partes, y el cron corre una vez al día.
 */
export const ABSOLUTE_FLOOR_DATE = "2020-01-01";

export function worklogFloorDate(): string {
  return ABSOLUTE_FLOOR_DATE;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * El accountId de Jira escondido en el email sombra que Giro da a la gente importada
 * que no llegó a casarse con un usuario real (`shadow+<accountId>@migrated.giro.internal`).
 * Para quien se registró de forma nativa en Giro no hay accountId que recuperar: ahí el
 * puente es `ProjectUserRole.giroUserEmail`.
 */
const SHADOW_EMAIL = /^shadow\+([^@]+)@migrated\.giro\.internal$/i;

export function jiraAccountIdFromGiroEmail(email: string): string | null {
  return SHADOW_EMAIL.exec(email)?.[1] ?? null;
}

export interface BucketConsumption {
  id: string;
  roleId: string;
  roleName: string;
  code: string | null;
  ratePerHour: number;
  totalHours: number;
  consumedHours: number;
  pendingApprovalHours: number;
  alertThreshold: number;
  startDate: string | null;
  endDate: string | null;
}

export interface ProjectConsumption {
  projectId: string;
  buckets: BucketConsumption[];
  /** Horas facturables que no cayeron en ninguna bolsa — el saldo es un techo, no un cierre. */
  pendingAttributionHours: number;
  nonBillableHours: number;
  /** Autores sin rol en el proyecto, con sus horas. Solo para uso interno. */
  unattributedByAuthor: Map<string, number>;
  source: HoursSource;
  worklogFloorDate: string;
}

type LoadedProject = NonNullable<Awaited<ReturnType<typeof loadProject>>>;

async function loadProject(projectId: string) {
  return prisma.jiraProject.findUnique({
    where: { id: projectId },
    include: {
      workspace: true,
      hourBuckets: { where: { active: true }, include: { role: true } },
      userRoles: true,
    },
  });
}

/**
 * Giro se usa cuando el proyecto está vinculado y hay credenciales. No hace falta un
 * interruptor por proyecto: el sync de Giro importa los partes de Jira/Tempo de toda la
 * organización, así que Giro es un **superconjunto** —tiene las horas nativas y las
 * espejadas— y para las espejadas `mirrorApprovalPeriod()` refleja además el estado de
 * aprobación de Tempo. Leer de Giro resuelve la transición sin elegir fuente a mano.
 */
function pickSource(project: LoadedProject): HoursSource {
  const canUseGiro =
    project.giroProjectId !== null &&
    project.workspace.giroApiKey !== null &&
    (process.env.GIRO_BASE_URL ?? "") !== "";
  return canUseGiro ? "GIRO" : "TEMPO";
}

function fromGiro(worklogs: GiroWorklog[]): ConsumptionWorklog[] {
  return worklogs.map((w) => ({
    authorId: w.authorEmail,
    issueKey: w.issueKey,
    // Giro cuenta en segundos y el ERP en horas: la conversión vive solo aquí.
    hours: w.timeSpentSeconds / 3600,
    date: w.startDate,
    billable: w.billable,
    approved: w.timesheetStatus === "APPROVED",
  }));
}

/**
 * Tempo no distingue facturable ni aprobado por línea, así que todo entra como
 * facturable y aprobado: es exactamente lo que la ruta calculaba antes, de modo que un
 * proyecto que aún no esté en Giro no cambia de número al pasar por aquí.
 */
function fromTempo(worklogs: { issue: { id: number; key?: string }; timeSpentSeconds: number; author: { accountId: string }; startDate: string }[]): ConsumptionWorklog[] {
  return worklogs.map((w) => ({
    authorId: w.author.accountId,
    issueKey: w.issue.key ?? null,
    hours: w.timeSpentSeconds / 3600,
    date: w.startDate,
    billable: true,
    approved: true,
  }));
}

export async function getProjectConsumption(projectId: string): Promise<ProjectConsumption | null> {
  const project = await loadProject(projectId);
  if (project === null) return null;

  const source = pickSource(project);
  const from = worklogFloorDate();
  const to = isoDay(new Date());

  let worklogs: ConsumptionWorklog[] = [];
  if (project.hourBuckets.length > 0) {
    if (source === "GIRO") {
      const client = new GiroClient(process.env.GIRO_BASE_URL!, project.workspace.giroApiKey!);
      worklogs = fromGiro(await client.listWorklogs(project.giroProjectId!, from, to));
    } else if (project.workspace.tempoApiToken !== null) {
      const client = new TempoClient(project.workspace.tempoApiToken);
      worklogs = fromTempo(await client.getWorklogs(project.jiraId, from, to));
    }
  }

  // El reparto por rol tiene que cruzar con lo que la fuente llame "autor": accountId de
  // Jira en Tempo, email en Giro.
  const authorToRole = new Map<string, string>();
  for (const ur of project.userRoles) {
    if (source === "GIRO") {
      if (ur.giroUserEmail !== null) authorToRole.set(ur.giroUserEmail.toLowerCase(), ur.roleId);
      // La gente importada y sin casar llega con el email sombra, que lleva dentro el accountId.
      authorToRole.set(`shadow+${ur.jiraAccountId}@migrated.giro.internal`, ur.roleId);
    } else {
      authorToRole.set(ur.jiraAccountId, ur.roleId);
    }
  }

  const assignments = await prisma.issueHourBucketAssignment.findMany({
    where: { projectId },
    select: { issueKey: true, hourBucketId: true },
  });

  const result = computeBucketConsumption({
    // Giro devuelve el email tal cual lo tenga la persona; el mapa está en minúsculas.
    worklogs: source === "GIRO"
      ? worklogs.map((w) => ({ ...w, authorId: w.authorId.toLowerCase() }))
      : worklogs,
    buckets: project.hourBuckets.map((b) => ({
      id: b.id,
      roleId: b.roleId,
      totalHours: b.totalHours,
      startDate: b.startDate === null ? null : isoDay(b.startDate),
      endDate: b.endDate === null ? null : isoDay(b.endDate),
    })),
    authorToRole,
    issueToBucket: new Map(assignments.map((a) => [a.issueKey, a.hourBucketId])),
  });

  return {
    projectId,
    buckets: project.hourBuckets.map((bucket) => toBucketConsumption(bucket, result)),
    pendingAttributionHours: result.pendingAttributionHours,
    nonBillableHours: result.nonBillableHours,
    unattributedByAuthor: new Map(
      [...result.unattributedByAuthor].map(([author, hours]) => [author, round2(hours)]),
    ),
    source,
    worklogFloorDate: from,
  };
}

function toBucketConsumption(
  bucket: LoadedProject["hourBuckets"][number],
  result: ConsumptionResult,
): BucketConsumption {
  return {
    id: bucket.id,
    roleId: bucket.roleId,
    roleName: bucket.role.name,
    code: bucket.code,
    ratePerHour: Number(bucket.role.ratePerHour),
    totalHours: bucket.totalHours,
    consumedHours: round2(result.hoursByBucketId.get(bucket.id) ?? 0),
    pendingApprovalHours: round2(result.pendingApprovalByBucketId.get(bucket.id) ?? 0),
    alertThreshold: bucket.alertThreshold,
    startDate: bucket.startDate === null ? null : isoDay(bucket.startDate),
    endDate: bucket.endDate === null ? null : isoDay(bucket.endDate),
  };
}
