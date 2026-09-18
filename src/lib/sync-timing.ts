/**
 * Presupuesto de tiempo de una sincronización y ventana a partir de la cual una
 * ejecución que sigue abierta se da por muerta.
 *
 * Viven aquí, y no en sync.ts, para poder probarlos sin arrastrar el cliente de Prisma.
 */

/**
 * Debe coincidir con el `export const maxDuration` de las rutas de sync. Next exige un
 * literal en la configuración de segmento, así que allí no se puede importar esta
 * constante — sync-timing.test.ts comprueba que no se desincronicen.
 */
export const SYNC_MAX_DURATION_SECONDS = 300;

/**
 * Una ejecución que lleva más de esto abierta no puede seguir viva: la plataforma ya la
 * habría matado. Tiene que ser holgadamente mayor que SYNC_MAX_DURATION_SECONDS — si
 * fuera menor daríamos por muerta una ejecución que todavía trabaja y dejaríamos arrancar
 * una segunda en paralelo, que es justo lo que este mecanismo existe para evitar.
 */
export const SYNC_STALE_AFTER_MS = 15 * 60 * 1000;

/** Instante antes del cual una ejecución todavía abierta se considera muerta. */
export function syncStaleCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - SYNC_STALE_AFTER_MS);
}
