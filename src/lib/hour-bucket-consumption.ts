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
  /**
   * Tiene rol, pero ese rol no tiene ninguna bolsa donde quepa la hora: ni una viva en
   * esa fecha, ni una que arranque dentro del margen posterior.
   */
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
  /** Horas contratadas. Es el tope a partir del cual se desborda a la siguiente bolsa. */
  totalHours: number;
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
  /**
   * Atribuidas a una bolsa pero todavía sin aprobar. Se enseñan aparte y **no restan
   * saldo**: se reparten contra su propia cuenta de hueco, así que no desplazan a las
   * horas aprobadas ni consumen packs posteriores en su lugar.
   */
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

/**
 * Cuánto puede estirarse una hora hacia atrás para que la cubra un pack posterior.
 *
 * Se trabaja y luego se factura, así que lo normal es imputar antes de que exista el
 * pack: en Z1 Gestión 31 de sus 37 h eran de las dos semanas previas a su propia bolsa.
 * Pero sin tope, trabajo de hace año y medio se comería un pack recién comprado —y en
 * silencio, porque dejaría de contarse como hora sin atribuir, que es donde se ve el
 * problema—. Dos meses cubre el desfase real entre trabajar y facturar; lo que caiga
 * fuera sigue saliendo como `ROLE_WITHOUT_BUCKET`, a la vista.
 */
const MARGEN_PACK_POSTERIOR_DIAS = 60;

/** Días entre dos "YYYY-MM-DD". Ambas se leen como UTC, así que no hay husos de por medio. */
function diasEntre(desde: string, hasta: string): number {
  return (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000;
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
 *  2. **Fallback por rol del autor**. Manda la ventana de la bolsa, con una excepción
 *     acotada: si la hora no cabe en ninguna bolsa viva, la absorbe el siguiente pack que
 *     arranque dentro de `MARGEN_PACK_POSTERIOR_DIAS`. Sin la ventana, renovar una bolsa
 *     la rompía: con caducidad de un año conviven dos bolsas activas del mismo rol, y el
 *     mapa rol→bolsa se quedaba con una sola, de modo que todo el histórico caía en ella
 *     (la renovada salía agotada de golpe y la anterior a 0 %). Una bolsa sin fechas
 *     cubre todo, así que las que hoy existen no cambian de número.
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

  // Las candidatas de un rol se recorren de la más antigua a la más nueva: es el orden
  // en el que se consumen.
  const porFecha = [...buckets].sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));
  const bucketsByRole = new Map<string, ConsumptionBucket[]>();
  for (const bucket of porFecha) {
    const list = bucketsByRole.get(bucket.roleId);
    if (list === undefined) bucketsByRole.set(bucket.roleId, [bucket]);
    else list.push(bucket);
  }

  // Hueco que le queda a cada bolsa mientras se reparte, con una cuenta POR CADA FLUJO.
  // `ConsumptionResult` promete que las horas pendientes de aprobación "se enseñan
  // aparte, no restan saldo", y con una sola cuenta eso era mentira: un parte sin aprobar
  // ocupaba hueco y empujaba a las horas aprobadas que llegaban después a la bolsa
  // siguiente. Con la cadena hacia packs futuros el efecto cruzaba además de un pack a
  // otro: 25 h sin aprobar en octubre dejaban el pack de noviembre con 5 h de hueco.
  const restantePorFlujo = {
    aprobado: new Map<string, number>(buckets.map((b) => [b.id, b.totalHours])),
    pendiente: new Map<string, number>(buckets.map((b) => [b.id, b.totalHours])),
  };

  // En orden cronológico, porque el reparto depende de lo que ya se haya consumido antes.
  const enOrden = [...worklogs].sort((a, b) => a.date.localeCompare(b.date));

  function leak(reason: AttributionReason, worklog: ConsumptionWorklog): void {
    pendingAttributionHours += worklog.hours;
    unattributedByReason.set(reason, (unattributedByReason.get(reason) ?? 0) + worklog.hours);
    if (reason === "NO_ROLE") addTo(unattributedByAuthor, worklog.authorId, worklog.hours);
  }

  for (const worklog of enOrden) {
    if (!worklog.billable) {
      nonBillableHours += worklog.hours;
      continue;
    }

    // Cada parte reparte contra la cuenta de su flujo: las aprobadas no ven el hueco que
    // ocupan las pendientes, ni al revés.
    const restante = worklog.approved ? restantePorFlujo.aprobado : restantePorFlujo.pendiente;

    let bucketId: string | undefined;

    const assigned = worklog.issueKey === null ? undefined : issueToBucket.get(worklog.issueKey);
    if (assigned !== undefined) {
      // Asignada a una bolsa que ya no está activa: antes se descartaba sin rastro.
      if (!hoursByBucketId.has(assigned)) {
        leak("UNKNOWN_BUCKET", worklog);
        continue;
      }
      bucketId = assigned;
      addTo(worklog.approved ? hoursByBucketId : pendingApprovalByBucketId, bucketId, worklog.hours);
      restante.set(bucketId, (restante.get(bucketId) ?? 0) - worklog.hours);
      continue;
    }

    const roleId = authorToRole.get(worklog.authorId);
    if (roleId === undefined) {
      leak("NO_ROLE", worklog);
      continue;
    }
    const delRol = bucketsByRole.get(roleId) ?? [];
    // Primero las bolsas vivas en esa fecha, de la más antigua a la más nueva: se
    // consume el pack que se compró primero.
    const vivas = delRol.filter((b) => coversDate(b, worklog.date));
    // Y detrás las que arrancan DESPUÉS, hasta `MARGEN_PACK_POSTERIOR_DIAS`. Una hora
    // que no cabe en ninguna bolsa viva la cubre el siguiente pack que se compre, que es
    // lo que pasa de verdad: te pasas de horas y el pack siguiente lo absorbe. Esto cubre
    // también el trabajo hecho justo antes de que exista el pack, que es lo normal —se
    // trabaja y luego se factura—: en Z1 Gestión 31 de sus 37 h eran anteriores a su
    // propia bolsa.
    const futuras = delRol.filter(
      (b) =>
        b.startDate !== null &&
        worklog.date < b.startDate &&
        diasEntre(worklog.date, b.startDate) <= MARGEN_PACK_POSTERIOR_DIAS,
    );
    const cadena = [...vivas, ...futuras];
    if (cadena.length === 0) {
      leak("ROLE_WITHOUT_BUCKET", worklog);
      continue;
    }

    let porRepartir = worklog.hours;
    for (const b of cadena) {
      if (porRepartir <= 0) break;
      const hueco = restante.get(b.id) ?? 0;
      const cabe = Math.max(Math.min(hueco, porRepartir), 0);
      if (cabe <= 0) continue;
      addTo(worklog.approved ? hoursByBucketId : pendingApprovalByBucketId, b.id, cabe);
      restante.set(b.id, hueco - cabe);
      porRepartir -= cabe;
    }
    // Si no cabe en ninguna, el resto sobrecarga la ÚLTIMA de la cadena: el exceso tiene
    // que verse como bolsa agotada —y en la más reciente, que es donde el cliente mira—
    // en vez de desaparecer.
    if (porRepartir > 0) {
      const ultima = cadena[cadena.length - 1];
      addTo(worklog.approved ? hoursByBucketId : pendingApprovalByBucketId, ultima.id, porRepartir);
      restante.set(ultima.id, (restante.get(ultima.id) ?? 0) - porRepartir);
    }
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
