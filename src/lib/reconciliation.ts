/**
 * Conciliación horas aprobadas ↔ facturas por horas (plan 28-ago, F3).
 *
 * Compara, por proyecto y periodo, el coste **aprobado** en Giro (partes ya
 * aprobados — la misma cifra que Giro usa para facturar) contra lo ya facturado en
 * Holded para ese proyecto. Excluye **precio cerrado** a propósito: ahí el importe
 * facturado no tiene por qué seguir las horas, así que compararlos no dice nada.
 *
 * El "proyecto de Giro" y las credenciales para llamarlo son opt-in por proyecto
 * (`JiraProject.giroProjectId`) y por workspace (`JiraWorkspace.giroOrgSlug`/
 * `giroApiKey`) — mientras no se rellenen, el proyecto no aparece aquí. Es
 * deliberadamente **más estrecho** que el Bloque E completo del plan: no toca
 * `hour-buckets`, `user-roles` ni `suppliers`, que siguen leyendo de Tempo.
 */
import { InvoiceType } from "@prisma/client";
import { prisma } from "./prisma";
import { GiroClient } from "./giro-client";

export type HourlyReconciliationRow = {
  projectId: string;
  jiraKey: string;
  name: string;
  workspaceName: string;
  /** `null` cuando no se pudo consultar Giro (ver `error`). */
  approvedHours: number | null;
  /** `null` = sin tarifa resoluble en Giro para esas horas, o no se pudo consultar. */
  approvedCost: number | null;
  invoicedEur: number;
  /** `invoicedEur - approvedCost`. `null` si `approvedCost` es `null`. */
  difference: number | null;
  /** Motivo por el que no hay coste aprobado, si lo hay. */
  error?: string;
};

function isoDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Σ `totalEur` de las líneas de factura de venta clasificadas a este proyecto en el
 * rango — mismo join que ya usa `/projects/[projectId]` para "facturas relacionadas"
 * (`lines: { some: { classification: { projectId } } }`), aquí acotado a `SALE`
 * porque es lo que hay que comparar contra horas trabajadas, no las de compra. */
async function sumInvoicedSales(projectId: string, from: Date, to: Date): Promise<number> {
  const invoices = await prisma.invoice.findMany({
    where: {
      type: InvoiceType.SALE,
      date: { gte: from, lte: to },
      removedFromHoldedAt: null,
      lines: { some: { classification: { projectId } } },
    },
    select: {
      lines: { select: { totalEur: true, classification: { select: { projectId: true } } } },
    },
  });

  let total = 0;
  for (const invoice of invoices) {
    for (const line of invoice.lines) {
      if (line.classification?.projectId === projectId) total += Number(line.totalEur);
    }
  }
  return total;
}

/**
 * Ids de proyecto de Giro marcados `isInternal` en el workspace de esa clave, en un
 * único `listProjects()` (no uno por proyecto). Se cachea por `giroApiKey`: varios
 * `JiraProject` comparten el mismo workspace y por tanto la misma clave.
 */
async function internalGiroProjectIds(giroBaseUrl: string, giroApiKey: string): Promise<Set<string>> {
  const client = new GiroClient(giroBaseUrl, giroApiKey);
  const projects = await client.listProjects();
  return new Set(projects.filter((p) => p.isInternal).map((p) => p.id));
}

export async function getHourlyReconciliation(from: Date, to: Date): Promise<HourlyReconciliationRow[]> {
  const projects = await prisma.jiraProject.findMany({
    where: { active: true, isPrecioCerrado: false, giroProjectId: { not: null } },
    include: { workspace: true },
    orderBy: { name: "asc" },
  });

  const giroBaseUrl = process.env.GIRO_BASE_URL;
  const fromStr = isoDay(from);
  const toStr = isoDay(to);

  // Proyectos internos de Giro (estructura, no facturable a un cliente) — se excluyen
  // del todo, igual que los de precio cerrado: compararlos no diría nada. Se resuelve
  // una vez por API key de workspace (no por proyecto, y en paralelo), antes de tocar
  // el resto de proyectos, para no perder el paralelismo del bucle principal.
  const distinctApiKeys = [
    ...new Set(projects.map((p) => p.workspace.giroApiKey).filter((key): key is string => Boolean(key))),
  ];
  const internalIdsByApiKey = new Map<string, Set<string>>();
  if (giroBaseUrl) {
    await Promise.all(
      distinctApiKeys.map(async (key) => {
        internalIdsByApiKey.set(key, await internalGiroProjectIds(giroBaseUrl, key).catch(() => new Set<string>()));
      }),
    );
  }

  const visibleProjects = projects.filter((project) => {
    if (!project.workspace.giroApiKey) return true; // sin key: no se puede saber si es interno, se enseña con su propio error
    const internalIds = internalIdsByApiKey.get(project.workspace.giroApiKey);
    return !internalIds?.has(project.giroProjectId!);
  });

  return Promise.all(
    visibleProjects.map(async (project): Promise<HourlyReconciliationRow> => {
      const invoicedEur = await sumInvoicedSales(project.id, from, to);
      const base = {
        projectId: project.id,
        jiraKey: project.jiraKey,
        name: project.name,
        workspaceName: project.workspace.name,
        invoicedEur,
      };

      if (!giroBaseUrl) {
        return { ...base, approvedHours: null, approvedCost: null, difference: null, error: "GIRO_BASE_URL no configurado" };
      }
      if (!project.workspace.giroApiKey) {
        return {
          ...base,
          approvedHours: null,
          approvedCost: null,
          difference: null,
          error: "El workspace no tiene API key de Giro configurada",
        };
      }

      try {
        const client = new GiroClient(giroBaseUrl, project.workspace.giroApiKey);
        // giroProjectId no puede ser null aquí: el `where` de arriba ya lo exige.
        const cost = await client.getProjectCost(project.giroProjectId!, fromStr, toStr);
        const approvedCost = cost.totalCost === null ? null : Number(cost.totalCost);
        return {
          ...base,
          approvedHours: cost.totalHours,
          approvedCost,
          difference: approvedCost === null ? null : invoicedEur - approvedCost,
        };
      } catch (error) {
        return {
          ...base,
          approvedHours: null,
          approvedCost: null,
          difference: null,
          error: error instanceof Error ? error.message : "Error desconocido consultando Giro",
        };
      }
    }),
  );
}
