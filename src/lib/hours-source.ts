/**
 * De dónde salen las horas de un proyecto, y en qué forma única las ve el resto del ERP
 * (Bloque E).
 *
 * `pickSource()` vivía dentro de `hour-buckets.ts` y solo lo usaban las bolsas. Al
 * migrar el resto de consumidores —el informe de horas, los roles por proyecto, la
 * verificación de proveedores— cada uno tendría que repetir la misma pregunta y, peor,
 * la misma resolución de identidad. Aquí se hace una vez.
 *
 * Dos decisiones que importan:
 *
 * 1. **La rama de Tempo resuelve `accountId → giroUserId` antes de devolver.** Así,
 *    aguas arriba, nadie vuelve a ramificar por fuente: todo el mundo trabaja con
 *    `personKey`, que siempre es un id de Giro. Sin esto, los seis consumidores
 *    tendrían seis copias de la misma regla de identidad.
 * 2. **Existe un tercer estado, `UNAVAILABLE`.** Hoy un proyecto sin `giroProjectId`
 *    cae a Tempo; cuando Tempo se apague, eso devolvería una lista vacía de worklogs y
 *    el ERP enseñaría consumo cero con la bolsa intacta — un número equivocado
 *    presentado como un número. `UNAVAILABLE` tiene que llegar hasta la pantalla como
 *    "proyecto sin vincular", nunca como 0.
 */
import { prisma } from "@/lib/prisma";

export type HoursSource = "GIRO" | "TEMPO" | "UNAVAILABLE";

export type NormalizedWorklog = {
  /** Id de persona en Giro. Siempre, venga de donde venga el worklog. */
  personKey: string | null;
  /** Key legible del issue (`FIN-73`), que es por donde se atribuye a bolsa. */
  issueKey: string | null;
  hours: number;
  /** `YYYY-MM-DD`. */
  date: string;
  /**
   * Tempo no distingue ninguna de las dos por línea, así que desde ahí todo llega
   * `true`. Es el delta esperado al pasar a Giro, y el motivo de que el saldo que ve el
   * cliente **suba** el día del flip: hay que enseñarlo antes, no explicarlo después.
   */
  billable: boolean;
  approved: boolean;
};

type ProyectoVinculable = {
  giroProjectId: string | null;
  workspace: { giroApiKey: string | null; tempoApiToken: string | null };
};

/**
 * Giro se usa cuando el proyecto está vinculado y hay credenciales. Tempo solo mientras
 * siga configurado: el día que se le quite el token al workspace, un proyecto sin
 * vincular pasa a `UNAVAILABLE` en vez de fingir que no tiene horas.
 */
export function resolveHoursSource(project: ProyectoVinculable): HoursSource {
  const puedeGiro =
    project.giroProjectId !== null &&
    project.workspace.giroApiKey !== null &&
    (process.env.GIRO_BASE_URL ?? "") !== "";
  if (puedeGiro) return "GIRO";

  return project.workspace.tempoApiToken ? "TEMPO" : "UNAVAILABLE";
}

/**
 * `accountId` de Jira → `giroUserId`, por el puente.
 *
 * Resuelve en lote porque los consumidores traen cientos de worklogs de golpe y una
 * consulta por autor sería una tormenta. Lo que no case devuelve `null` y **tiene que
 * verse**: un autor sin resolver cae en "sin atribuir" y su coste se subestima en
 * silencio, que es justo el fallo que este módulo existe para evitar.
 */
export async function resolvePersonKeys(accountIds: string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(accountIds)];
  if (unicos.length === 0) return new Map();

  const enlaces = await prisma.giroUserLink.findMany({
    where: { jiraAccountId: { in: unicos } },
    select: { jiraAccountId: true, giroUserId: true },
  });

  return new Map(enlaces.map((enlace) => [enlace.jiraAccountId, enlace.giroUserId]));
}

/** Los `accountId` que no tienen puente. Si esto no está vacío, hay horas en riesgo. */
export async function unresolvedAccountIds(accountIds: string[]): Promise<string[]> {
  const resueltos = await resolvePersonKeys(accountIds);
  return [...new Set(accountIds)].filter((accountId) => !resueltos.has(accountId));
}

/** Email de Giro → `giroUserId`, para los worklogs que vienen ya de Giro. */
export async function resolvePersonKeysByEmail(emails: string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(emails.map((email) => email.toLowerCase()))];
  if (unicos.length === 0) return new Map();

  const enlaces = await prisma.giroUserLink.findMany({
    where: { giroUserEmail: { in: unicos, mode: "insensitive" } },
    select: { giroUserEmail: true, giroUserId: true },
  });

  return new Map(enlaces.map((enlace) => [enlace.giroUserEmail.toLowerCase(), enlace.giroUserId]));
}

// ─── Resolución de personas ───────────────────────────────────────────────────

/**
 * Una persona, en la forma que pintan las pantallas de proveedores. Es la misma que
 * devolvía `JiraUser`, para que migrar la fuente no obligue a tocar la UI.
 */
export type Persona = {
  accountId: string;
  displayName: string;
  emailAddress: string;
  avatarUrl: string | null;
  /**
   * Sigue en activo. Desde Jira es su `active`; desde Giro, tener membership viva — un
   * *shadow* no la tiene. Significa lo mismo en los dos sitios: la pantalla marca
   * "(inactivo)" sin saber de dónde vino el dato.
   */
  active: boolean;
  /** Importada y sin cuenta propia en Giro: no podrá imputar tras el cutover. */
  isShadow?: boolean;
};

/** Giro sirve las personas cuando hay algún workspace con clave y `GIRO_BASE_URL`. */
export function canResolvePeopleFromGiro(workspaces: { giroApiKey: string | null }[]): boolean {
  return (
    (process.env.GIRO_BASE_URL ?? "") !== "" && workspaces.some((w) => w.giroApiKey !== null)
  );
}
