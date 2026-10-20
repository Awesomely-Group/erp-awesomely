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

// ─── Worklogs crudos de un proyecto ───────────────────────────────────────────

/**
 * Una línea de imputación, ya normalizada: la misma forma venga de Giro o de Tempo.
 *
 * La llave de persona es el **`accountId` de Jira** y no el `giroUserId` porque es
 * contra ella contra la que el ERP tiene escritas las tarifas
 * (`ProjectUserRole.jiraAccountId`, `SupplierJiraUser.accountId`). Lo que hace el
 * puente es devolver desde Giro esa misma llave, no cambiarla.
 */
export type WorklogLinea = {
  accountId: string;
  issueKey: string;
  /** Id numérico de Jira. `null` desde Giro: allí no existe. */
  issueNumericId: number | null;
  description: string;
  seconds: number;
  /** `YYYY-MM-DD`. */
  date: string;
};

export type IssueMeta = { summary: string; originalEstimateSeconds: number | null };

export type ProjectWorklogs = {
  source: HoursSource;
  worklogs: WorklogLinea[];
  /** Por `issueKey`, y **solo** de los issues que tienen horas en el rango. */
  issues: Map<string, IssueMeta>;
  /** `accountId` → nombre para pintar. */
  nombres: Map<string, string>;
  /**
   * Personas cuyas horas vienen de Giro sin `accountId` al otro lado del puente. Sus
   * líneas **se devuelven igual** (perderlas sería perder horas trabajadas), pero no
   * van a encontrar tarifa: salen a 0 €. Es un número que tiene que poder enseñarse.
   */
  sinPuente: string[];
};

/**
 * Elige con qué `accountId` se representa a una persona que tiene varios.
 *
 * Giro fusiona cuentas de Atlassian de la misma persona, así que un `giroUserId` puede
 * traer dos o tres. El ERP, en cambio, tiene la tarifa escrita contra **una** de ellas.
 * Se prefiere la que el ERP conoce; si no conoce ninguna, la primera por orden
 * alfabético, para que la elección sea estable entre peticiones y no baile el nombre
 * de una pantalla a otra.
 */
function eligeAccountId(candidatos: string[], conocidos: Set<string>): string | null {
  const ordenados = [...candidatos].sort();
  return ordenados.find((accountId) => conocidos.has(accountId)) ?? ordenados[0] ?? null;
}

/**
 * Las horas de un proyecto en un rango, crudas, con el nombre y la estimación de cada
 * issue resueltos.
 *
 * **No calcula coste a propósito.** Giro también sabe calcularlo, pero con su catálogo
 * de tarifas (`ProjectMemberRole`/`RoleRate`), que es la tarifa interna; lo que pintan
 * las pantallas de proyecto del ERP es el coste de proveedor
 * (`Supplier.hourlyRate` / `ProjectUserRole.ratePerHour`). Son dos números distintos
 * que significan cosas distintas, y mezclarlos sería cambiar lo que dice la pantalla
 * sin que nadie lo haya pedido.
 */
export async function projectWorklogs(
  project: ProyectoConJira & { id: string },
  rango: { from: string; to: string },
): Promise<ProjectWorklogs> {
  const source = resolveHoursSource(project);
  const vacio: ProjectWorklogs = {
    source,
    worklogs: [],
    issues: new Map(),
    nombres: new Map(),
    sinPuente: [],
  };
  if (source === "UNAVAILABLE") return vacio;

  if (source === "GIRO") {
    const { GiroClient } = await import("@/lib/giro-client");
    const client = new GiroClient(process.env.GIRO_BASE_URL!, project.workspace.giroApiKey!);

    const crudos = await client.listWorklogs(project.giroProjectId!, rango.from, rango.to);
    if (crudos.length === 0) return vacio;

    // Los `accountId` que este ERP ya usa para este proyecto. Decide cuál se elige
    // cuando una persona tiene varias cuentas fusionadas en Giro.
    const [personas, issues, deProyecto, deProveedores] = await Promise.all([
      client.listUsers(),
      client.listIssues(project.giroProjectId!, true),
      prisma.projectUserRole.findMany({
        where: { projectId: project.id },
        select: { jiraAccountId: true },
      }),
      prisma.supplierJiraUser.findMany({ select: { accountId: true } }),
    ]);
    const conocidos = new Set([
      ...deProyecto.map((fila) => fila.jiraAccountId),
      ...deProveedores.map((fila) => fila.accountId),
    ]);

    const nombres = new Map<string, string>();
    const porGiroUserId = new Map<string, string>();
    const sinAccountId = new Set<string>();
    for (const persona of personas) {
      const accountId = eligeAccountId(persona.accountIds, conocidos);
      // Sin puente la hora no desaparece: se representa con el propio id de Giro. Así
      // sigue contando en el total y se ve con tarifa 0, que es el síntoma correcto.
      const clave = accountId ?? persona.id;
      if (accountId === null) sinAccountId.add(persona.id);
      porGiroUserId.set(persona.id, clave);
      nombres.set(clave, persona.name ?? persona.email);
    }

    // Solo se avisa de quien **ha imputado** en el rango. Media organización sin
    // `accountId` no es una incidencia si ninguna de esas personas tocó el proyecto.
    const sinPuente = [
      ...new Set(
        crudos
          .filter((worklog) => sinAccountId.has(worklog.authorId))
          .map((worklog) => nombres.get(worklog.authorId) ?? worklog.authorEmail),
      ),
    ];

    const worklogs: WorklogLinea[] = crudos.map((worklog) => ({
      accountId: porGiroUserId.get(worklog.authorId) ?? worklog.authorId,
      issueKey: worklog.issueKey,
      issueNumericId: null,
      description: worklog.description ?? "",
      seconds: worklog.timeSpentSeconds,
      date: worklog.startDate,
    }));

    // Solo los issues con horas: `month-cost` suma la estimación de este mapa, y
    // meter el proyecto entero cambiaría el número que lleva años enseñándose.
    const conHoras = new Set(worklogs.map((worklog) => worklog.issueKey));
    const meta = new Map<string, IssueMeta>();
    for (const issue of issues) {
      if (!conHoras.has(issue.key)) continue;
      meta.set(issue.key, {
        summary: issue.summary,
        originalEstimateSeconds: issue.originalEstimateSeconds,
      });
    }

    return { source, worklogs, issues: meta, nombres, sinPuente };
  }

  const { TempoClient } = await import("@/lib/tempo");
  const { JiraClient } = await import("@/lib/jira");

  const tempo = new TempoClient(project.workspace.tempoApiToken!);
  const crudos = await tempo.getWorklogs(project.jiraId, rango.from, rango.to);
  if (crudos.length === 0) return vacio;

  const accountIds = [...new Set(crudos.map((worklog) => worklog.author.accountId))];
  const issueIds = [...new Set(crudos.map((worklog) => worklog.issue.id))];

  const jira = new JiraClient(
    project.workspace.domain,
    project.workspace.email,
    project.workspace.apiToken,
  );
  const [deJira, nombres] = await Promise.all([
    jira.getIssuesByIds(issueIds).catch(() => []),
    jira.getUsersByAccountIds(accountIds),
  ]);

  // Tempo no siempre trae la key del issue, solo su id numérico; la key sale de Jira y,
  // si ni eso, se cae al id para no perder la línea.
  const porNumericId = new Map(deJira.map((issue) => [issue.numericId, issue]));
  const claveDe = (id: number): string => porNumericId.get(id)?.key ?? String(id);

  const worklogs: WorklogLinea[] = crudos.map((worklog) => ({
    accountId: worklog.author.accountId,
    issueKey: claveDe(worklog.issue.id),
    issueNumericId: worklog.issue.id,
    description: worklog.description ?? "",
    seconds: worklog.timeSpentSeconds,
    date: worklog.startDate,
  }));

  const meta = new Map<string, IssueMeta>();
  for (const issue of deJira) {
    meta.set(issue.key, {
      summary: issue.summary,
      originalEstimateSeconds: issue.originalEstimateSeconds,
    });
  }

  return { source, worklogs, issues: meta, nombres, sinPuente: [] };
}
