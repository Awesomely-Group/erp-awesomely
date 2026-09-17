import { HoldedClient, type ContactBankData } from "./holded";
import { mapWithConcurrency } from "./concurrency";

/**
 * Resolución de datos bancarios de contactos de Holded, con caché en memoria,
 * concurrencia acotada y errores explícitos.
 *
 * Por qué caché propia y no `unstable_cache`: esta caché la consume la pantalla
 * de Pagos, cuyas cuatro acciones llaman `revalidatePath("/payments")`.
 * `unstable_cache` propaga los tags implícitos del render, así que cada pago
 * registrado invalidaría todos los IBAN — justo la acción más frecuente de la
 * pantalla. Además la clave de caché incluiría la API key, que es un secreto, y
 * la API está deprecada en Next 16 a favor de `"use cache"`, que exige activar
 * cacheComponents en todo el proyecto.
 *
 * Limitación conocida: la caché es por instancia, así que cada lambda paga su
 * primer arranque. Si no basta, el siguiente paso es persistir en Postgres,
 * como ya se hace con `Employee.iban`.
 */

/** Un contacto no cambia de banco entre pageviews. */
const TTL_OK_MS = 15 * 60 * 1000;
/** Un fallo no debe quedarse clavado el TTL largo. */
const TTL_ERROR_MS = 60 * 1000;
const MAX_ENTRIES = 500;
const DEFAULT_CONCURRENCY = 6;
const REQUEST_TIMEOUT_MS = 8000;

export type ContactBankDataResult =
  | { status: "ok"; data: ContactBankData; fetchedAt: number }
  | {
      status: "unavailable";
      reason: "http" | "network" | "timeout";
      httpStatus: number | null;
    };

export interface ContactBankRequest {
  companyId: string;
  apiKey: string;
  contactId: string;
}

interface CacheEntry {
  result: ContactBankDataResult;
  expiresAt: number;
}

// La clave lleva companyId: el mismo contactId puede existir en dos empresas
// distintas y antes se indexaba solo por contacto.
function cacheKey(req: ContactBankRequest): string {
  return `${req.companyId}:${req.contactId}`;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<ContactBankDataResult>>();

function readCache(key: string, now: number): ContactBankDataResult | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    cache.delete(key);
    return null;
  }
  return entry.result;
}

function writeCache(key: string, result: ContactBankDataResult, now: number): void {
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, {
    result,
    expiresAt: now + (result.status === "ok" ? TTL_OK_MS : TTL_ERROR_MS),
  });
}

function toFailure(err: unknown): ContactBankDataResult {
  if (err instanceof Error && err.name === "TimeoutError") {
    return { status: "unavailable", reason: "timeout", httpStatus: null };
  }
  const status = (err as { status?: unknown }).status;
  if (typeof status === "number") {
    return { status: "unavailable", reason: "http", httpStatus: status };
  }
  return { status: "unavailable", reason: "network", httpStatus: null };
}

async function fetchOneDefault(req: ContactBankRequest): Promise<ContactBankData> {
  const client = new HoldedClient(req.apiKey);
  return client.getContactBankData(req.contactId, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

/**
 * Devuelve los datos bancarios de cada contacto pedido, indexados por
 * `${companyId}:${contactId}`. Nunca lanza: un fallo se expresa como
 * `status: "unavailable"`, para que la UI pueda distinguirlo de "este contacto
 * no tiene IBAN".
 */
export async function getContactsBankData(
  requests: readonly ContactBankRequest[],
  options?: {
    concurrency?: number;
    fetchOne?: (req: ContactBankRequest) => Promise<ContactBankData>;
  },
): Promise<Map<string, ContactBankDataResult>> {
  const now = Date.now();
  const fetchOne = options?.fetchOne ?? fetchOneDefault;
  const out = new Map<string, ContactBankDataResult>();

  // Deduplica los contactos repetidos y resuelve de caché lo que se pueda.
  const pending = new Map<string, ContactBankRequest>();
  for (const req of requests) {
    const key = cacheKey(req);
    if (out.has(key) || pending.has(key)) continue;
    const cached = readCache(key, now);
    if (cached) out.set(key, cached);
    else pending.set(key, req);
  }

  const toFetch = [...pending.entries()];
  const results = await mapWithConcurrency(
    toFetch,
    options?.concurrency ?? DEFAULT_CONCURRENCY,
    async ([key, req]) => {
      // Si otro render ya pidió este contacto, se comparte el vuelo.
      const existing = inFlight.get(key);
      if (existing) return existing;

      const flight = fetchOne(req)
        .then<ContactBankDataResult>((data) => ({
          status: "ok",
          data,
          fetchedAt: Date.now(),
        }))
        .catch(toFailure)
        .then((result) => {
          writeCache(key, result, Date.now());
          inFlight.delete(key);
          return result;
        });

      inFlight.set(key, flight);
      return flight;
    },
  );

  toFetch.forEach(([key], i) => out.set(key, results[i]));
  return out;
}

/** Solo para tests: vacía la caché y los vuelos en curso. */
export function resetContactBankCache(): void {
  cache.clear();
  inFlight.clear();
}
