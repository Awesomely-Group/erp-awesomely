/**
 * Reparto de horas imputadas entre las bolsas de un proyecto — función pura.
 *
 * Vivía dentro de `src/app/api/projects/[projectId]/hour-buckets/route.ts`, donde no
 * se podía probar: el repo no tiene tests de rutas ni de BD, todos son de funciones
 * puras. Se saca aquí porque este cálculo pasa a alimentar **dos** consumidores —la
 * pantalla interna del proyecto y la API del portal de cliente (plan 2026-09-20)— y
 * dos implementaciones del mismo saldo acabarían dando dos cifras distintas al
 * cliente y a nosotros.
 *
 * No sabe de Prisma, de Giro ni de Tempo: recibe los partes ya normalizados, de modo
 * que cambiar la fuente de horas (Bloque E: de Tempo a Giro) no toca este archivo.
 */

/** Motivos por los que una hora facturable no acaba en ninguna bolsa. */
export type AttributionReason =
  /** El autor no tiene rol asignado en el proyecto. */
  | "NO_ROLE"
  /** Tiene rol, pero ese rol no tiene bolsa activa que cubra la fecha del parte. */
  | "ROLE_WITHOUT_BUCKET"
  /** El issue está asignado a mano a una bolsa que ya no está activa. */
  | "UNKNOWN_BUCKET";

export interface ConsumptionWorklog {
  /**
   * Quién imputó. Es el `accountId` de Jira cuando la fuente es Tempo y el email
   * cuando es Giro — a esta función le da igual cuál, solo lo usa para cruzar con
   * `authorToRole`, que tiene que venir en la misma moneda.
   */
  authorId: string;
  /** Key del issue ("FIN-73"). Es la llave de atribución; Giro no expone el id numérico de Jira. */
  issueKey: string | null;
  hours: number;
  /** Día imputado, "YYYY-MM-DD". Nunca un instante: ver `endOfUtcDay` en Giro. */
  date: string;
  /** Una hora no facturable no consume bolsa (decisión 2026-09-20). Tempo no lo da: allí siempre `true`. */
  billable: boolean;
  /** Parte aprobado. Tempo no lo da por línea: allí siempre `true`. */
  approved: boolean;
}

export interface ConsumptionBucket {
  id: string;
  roleId: string;
  /** Límites de la bolsa, "YYYY-MM-DD". `null` = sin límite por ese lado. */
  startDate: string | null;
  endDate: string | null;
}

export interface ConsumptionInput {
  worklogs: readonly ConsumptionWorklog[];
  /** Solo las bolsas **activas**: una inactiva no recibe horas ni siquiera por asignación explícita. */
  buckets: readonly ConsumptionBucket[];
  /** Autor → rol en este proyecto (`ProjectUserRole`). */
  authorToRole: ReadonlyMap<string, string>;
  /** Issue → bolsa asignada a mano (`IssueHourBucketAssignment`). */
  issueToBucket: ReadonlyMap<string, string>;
}

export interface ConsumptionResult {
  /** Horas que consumen bolsa: facturables, aprobadas y dentro de ventana. */
  hoursByBucketId: ReadonlyMap<string, number>;
  /** Atribuidas a una bolsa pero todavía sin aprobar. Se enseñan aparte, no restan saldo. */
  pendingApprovalByBucketId: ReadonlyMap<string, number>;
  /** Facturables que no caen en ninguna bolsa. Es el número que el portal publica. */
  pendingAttributionHours: number;
  /** Desglose interno del anterior. Nunca sale al portal. */
  unattributedByReason: ReadonlyMap<AttributionReason, number>;
  /** Horas por autor sin rol asignado. Alimenta el aviso de la pantalla interna. */
  unattributedByAuthor: ReadonlyMap<string, number>;
  /** No facturables. Ni consumen ni cuentan como pendientes: son coste nuestro. */
  nonBillableHours: number;
}

/** Las fechas son "YYYY-MM-DD", así que comparar como cadena ya ordena bien. */
function coversDate(bucket: ConsumptionBucket, date: string): boolean {
  if (bucket.startDate !== null && date < bucket.startDate) return false;
  if (bucket.endDate !== null && date > bucket.endDate) return false;
  return true;
}

function addTo(map: Map<string, number>, key: string, hours: number): void {
  map.set(key, (map.get(key) ?? 0) + hours);
}

/**
 * Reparte los partes entre las bolsas.
 *
 * Dos vías de atribución, en este orden:
 *
 *  1. **Asignación explícita del issue** a una bolsa. Gana siempre y **no** se filtra
 *     por fecha: es una decisión deliberada de una persona y tiene que poder pesar más
 *     que el calendario.
 *  2. **Fallback por rol del autor**, y aquí sí manda la ventana de la bolsa. Sin esto,
 *     renovar una bolsa la rompía: con caducidad de un año conviven dos bolsas activas
 *     del mismo rol, y el mapa rol→bolsa se quedaba con una sola, de modo que todo el
 *     histórico caía en ella (la renovada salía agotada de golpe y la anterior a 0 %).
 *     Una bolsa sin fechas cubre todo, así que las que hoy existen no cambian de número.
 *
 * Lo que no encaja **no se pierde en silencio**, que es lo que pasaba hasta ahora en
 * tres casos distintos: se acumula en `pendingAttributionHours` para que el saldo se
 * presente como un techo y no como un dato cerrado.
 */
export function computeBucketConsumption(input: ConsumptionInput): ConsumptionResult {
  const { worklogs, buckets, authorToRole, issueToBucket } = input;

  const hoursByBucketId = new Map<string, number>(buckets.map((b) => [b.id, 0]));
  const pendingApprovalByBucketId = new Map<string, number>(buckets.map((b) => [b.id, 0]));
  const unattributedByReason = new Map<AttributionReason, number>();
  const unattributedByAuthor = new Map<string, number>();
  let pendingAttributionHours = 0;
  let nonBillableHours = 0;

  const bucketsByRole = new Map<string, ConsumptionBucket[]>();
  for (const bucket of buckets) {
    const list = bucketsByRole.get(bucket.roleId);
    if (list === undefined) bucketsByRole.set(bucket.roleId, [bucket]);
    else list.push(bucket);
  }

  function leak(reason: AttributionReason, worklog: ConsumptionWorklog): void {
    pendingAttributionHours += worklog.hours;
    unattributedByReason.set(reason, (unattributedByReason.get(reason) ?? 0) + worklog.hours);
    if (reason === "NO_ROLE") addTo(unattributedByAuthor, worklog.authorId, worklog.hours);
  }

  for (const worklog of worklogs) {
    if (!worklog.billable) {
      nonBillableHours += worklog.hours;
      continue;
    }

    let bucketId: string | undefined;

    const assigned = worklog.issueKey === null ? undefined : issueToBucket.get(worklog.issueKey);
    if (assigned !== undefined) {
      // Asignada a una bolsa que ya no está activa: antes se descartaba sin rastro.
      if (!hoursByBucketId.has(assigned)) {
        leak("UNKNOWN_BUCKET", worklog);
        continue;
      }
      bucketId = assigned;
    } else {
      const roleId = authorToRole.get(worklog.authorId);
      if (roleId === undefined) {
        leak("NO_ROLE", worklog);
        continue;
      }
      const candidates = bucketsByRole.get(roleId) ?? [];
      bucketId = candidates.find((b) => coversDate(b, worklog.date))?.id;
      if (bucketId === undefined) {
        leak("ROLE_WITHOUT_BUCKET", worklog);
        continue;
      }
    }

    addTo(worklog.approved ? hoursByBucketId : pendingApprovalByBucketId, bucketId, worklog.hours);
  }

  return {
    hoursByBucketId,
    pendingApprovalByBucketId,
    pendingAttributionHours: round2(pendingAttributionHours),
    unattributedByReason,
    unattributedByAuthor,
    nonBillableHours: round2(nonBillableHours),
  };
}

/** Dos decimales, el mismo redondeo que ya aplicaba la ruta al publicar horas. */
export function round2(hours: number): number {
  return Math.round(hours * 100) / 100;
}

/**
 * Estado de una bolsa. Estaba dentro de `BucketCard`, mezclado con las clases de
 * Tailwind; se saca porque el portal de cliente tiene que llegar exactamente al mismo
 * veredicto que la pantalla interna, y con la lógica dentro de un componente la única
 * forma de reutilizarla era copiarla.
 *
 * `EXPIRED` gana a todo lo demás: una bolsa caducada al 40 % sigue sin poder usarse, y
 * enseñarla como "activa" invitaría a seguir imputando contra ella.
 */
export type BucketStatus = "ACTIVE" | "NEAR_EXHAUSTION" | "EXHAUSTED" | "EXPIRED";

export function bucketStatus(args: {
  consumedHours: number;
  totalHours: number;
  alertThreshold: number;
  endDate: string | null;
  /** Hoy, "YYYY-MM-DD". Se pasa en vez de leer el reloj para poder probarlo. */
  today: string;
}): BucketStatus {
  const { consumedHours, totalHours, alertThreshold, endDate, today } = args;

  if (endDate !== null && today > endDate) return "EXPIRED";

  // Una bolsa de 0 horas no está "agotada", está sin configurar: dividir daría Infinity.
  const ratio = totalHours > 0 ? consumedHours / totalHours : 0;
  if (ratio >= 1) return "EXHAUSTED";
  if (ratio >= alertThreshold) return "NEAR_EXHAUSTION";
  return "ACTIVE";
}
