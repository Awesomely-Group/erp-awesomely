/**
 * Cliente mínimo de la API v1 de Giro (plan 28-ago, F3 — conciliación horas
 * aprobadas ↔ facturas).
 *
 * No usa `@giro/contracts` (el paquete de tipos compartidos que Giro publica para
 * este propósito) porque ese paquete vive en el monorepo de Giro y este repo no es
 * parte de ese workspace — no hay pipeline de publicación todavía. Mismo criterio
 * que `TempoClient`/`HoldedClient`: un cliente HTTP pequeño y propio por sistema
 * externo, con solo lo que este ERP necesita (aquí, un único endpoint).
 *
 * Si en el futuro `@giro/contracts` se publica a un registro accesible desde aquí,
 * este archivo se sustituye por ese cliente tipado sin cambiar la superficie que
 * usa `getHourlyReconciliation()`.
 */
export type GiroProjectCost = {
  projectId: string;
  projectKey: string;
  periodStart: string;
  periodEnd: string;
  totalHours: number;
  billableHours: number;
  /** `null` = ninguna hora del proyecto en el rango tiene tarifa resoluble en Giro. */
  totalCost: string | null;
  billableCost: string | null;
};

/**
 * Un parte de Giro. Sustituye a `TempoWorklog` como fuente de horas (Bloque E del plan
 * del 28-ago, pendiente hasta ahora: solo se había migrado la conciliación).
 *
 * Tres campos que Tempo nunca dio y de los que depende el saldo que ve el cliente:
 * `issueKey` (la llave de atribución a bolsa — Giro no expone el id numérico de Jira),
 * `billable` y `timesheetStatus`.
 */
export type GiroWorklog = {
  id: string;
  issueId: string;
  issueKey: string;
  projectId: string;
  authorId: string;
  authorEmail: string;
  timeSpentSeconds: number;
  /** El día imputado, "YYYY-MM-DD" — no un instante. */
  startDate: string;
  description: string | null;
  billable: boolean;
  /** `null` = imputada y todavía sin enviar a ningún parte. */
  timesheetStatus: "OPEN" | "SUBMITTED" | "APPROVED" | "REJECTED" | null;
};

export type GiroProject = {
  id: string;
  key: string;
  name: string;
  /** Proyecto de estructura, no facturable a un cliente — la conciliación lo excluye. */
  isInternal: boolean;
};

export class GiroClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = `${baseUrl.replace(/\/$/, "")}/api/v1`;
    this.apiKey = apiKey;
  }

  private async get(path: string, params: Record<string, string>): Promise<unknown> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.apiKey}`, Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`Giro API ${res.status}: ${await res.text()}`);
    }
    return res.json();
  }

  async getProjectCost(projectId: string, from: string, to: string): Promise<GiroProjectCost> {
    return (await this.get("/project-cost", { projectId, from, to })) as GiroProjectCost;
  }

  /**
   * Todos los proyectos de la org de la clave. Sirve para resolver una *key* de Giro
   * (visible en su UI, p.ej. "AWI") al id interno que de verdad guarda
   * `JiraProject.giroProjectId` — nadie ve ese id en ningún sitio de la UI de Giro,
   * así que vincular por id a mano no era viable.
   */
  /**
   * Partes de un proyecto en un rango de días. `from`/`to` son obligatorios en la API
   * de Giro y son el **único** freno: el endpoint no pagina ni acepta límite, así que
   * el rango lo acota quien llama (ver `worklogFloorDate` en `hour-buckets.ts`).
   */
  async listWorklogs(projectId: string, from: string, to: string): Promise<GiroWorklog[]> {
    return (await this.get("/worklogs", { projectId, from, to })) as GiroWorklog[];
  }

  async listProjects(): Promise<GiroProject[]> {
    return (await this.get("/projects", {})) as GiroProject[];
  }
}
