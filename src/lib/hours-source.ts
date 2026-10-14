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

/** Lo que hace falta para hablar con Jira/Tempo mientras siga existiendo esa rama. */
type ProyectoConJira = ProyectoVinculable & {
  jiraId: string;
  workspace: { giroApiKey: string | null; tempoApiToken: string | null; domain: string; email: string; apiToken: string };
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

/**
 * Quién imputó en un proyecto durante un rango, en la forma que el ERP indexa: por
 * `accountId` de Jira.
 *
 * El ERP guarda los roles y las tarifas contra `ProjectUserRole.jiraAccountId` y
 * `SupplierJiraUser.accountId`, así que aunque las horas vengan ya de Giro hay que
 * volver al `accountId` para cruzarlas. Ese es justo el papel del puente, y el motivo
 * de que se conserve el `accountId` en vez de jubilarlo: es la llave de todo lo que el
 * ERP ya tiene escrito.
 *
 * `incluirTodoElHistorico` existe para los proyectos de fee regular: ahí interesa quién
 * ha tocado el proyecto alguna vez, no solo en el mes que se está mirando, porque el
 * fee se reparte entre el equipo asignado y no entre quien casualmente imputó.
 */
export async function projectAuthors(
  project: ProyectoConJira,
  rango: { from: string; to: string; incluirTodoElHistorico?: boolean },
): Promise<{ source: HoursSource; authors: { accountId: string; displayName: string }[] }> {
  const source = resolveHoursSource(project);
  if (source === "UNAVAILABLE") return { source, authors: [] };

  if (source === "GIRO") {
    const { GiroClient } = await import("@/lib/giro-client");
    const client = new GiroClient(process.env.GIRO_BASE_URL!, project.workspace.giroApiKey!);

    const periodos = rango.incluirTodoElHistorico
      ? [
          { from: rango.from, to: rango.to },
          { from: "2020-01-01", to: new Date().toISOString().slice(0, 10) },
        ]
      : [{ from: rango.from, to: rango.to }];

    const emails = new Set<string>();
    for (const periodo of periodos) {
      const worklogs = await client.listWorklogs(project.giroProjectId!, periodo.from, periodo.to);
      for (const worklog of worklogs) emails.add(worklog.authorEmail.toLowerCase());
    }
    if (emails.size === 0) return { source, authors: [] };

    // Una sola llamada: una organización son decenas de personas, y pedirlas de una vez
    // deja resolver el nombre y el accountId en el mismo sitio.
    const personas = await client.listUsers();
    const authors: { accountId: string; displayName: string }[] = [];
    for (const persona of personas) {
      if (!emails.has(persona.email.toLowerCase())) continue;
      for (const accountId of persona.accountIds) {
        authors.push({ accountId, displayName: persona.name ?? persona.email });
      }
    }
    return { source, authors };
  }

  const { TempoClient } = await import("@/lib/tempo");
  const { JiraClient } = await import("@/lib/jira");
  const tempo = new TempoClient(project.workspace.tempoApiToken!);

  const accountIds = new Set<string>();
  const worklogs = await tempo.getWorklogs(project.jiraId, rango.from, rango.to);
  for (const worklog of worklogs) accountIds.add(worklog.author.accountId);

  if (rango.incluirTodoElHistorico) {
    const todos = await tempo.getWorklogs(
      project.jiraId,
      "2020-01-01",
      new Date().toISOString().slice(0, 10),
    );
    for (const worklog of todos) accountIds.add(worklog.author.accountId);
  }
  if (accountIds.size === 0) return { source, authors: [] };

  const jira = new JiraClient(
    project.workspace.domain,
    project.workspace.email,
    project.workspace.apiToken,
  );
  const nombres = await jira.getUsersByAccountIds([...accountIds]);

  return {
    source,
    authors: [...accountIds].map((accountId) => ({
      accountId,
      displayName: nombres.get(accountId) ?? accountId,
    })),
  };
}
