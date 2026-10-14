/**
 * Lectura del JSON `details` de un SyncLog.
 *
 * `closeSyncLog` guarda un objeto distinto según cómo acabe la pasada: el sync normal
 * de Holded omite `fetchedIds`/`upsertErrors` cuando están vacíos, y la empresa que se
 * queda fuera por falta de presupuesto de tiempo solo graba `{ mode, skipped }`. El
 * modal de /sync daba por hecho que esas dos listas siempre estaban y reventaba la
 * página entera al abrir, por ejemplo, el error de Awesomely SL del 13/10/2026.
 *
 * Vive aquí, y no en el componente, para poder probarlo sin montar React.
 */

export type SyncUpsertError = {
  type: string;
  holdedId: string;
  docNumber: string;
  error: string;
};

export type SyncLogDetails = {
  /** Documentos que Holded devolvió en el listado de esa pasada. */
  fetchedIds: string[];
  upsertErrors: SyncUpsertError[];
  /** La empresa no llegó a sincronizarse: no quedaba presupuesto de tiempo. */
  skipped: boolean;
  /** "incremental" | "full", null si la fila es anterior a que se grabara. */
  mode: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function asUpsertErrors(value: unknown): SyncUpsertError[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((e) => ({
    type: typeof e.type === "string" ? e.type : "",
    holdedId: typeof e.holdedId === "string" ? e.holdedId : "",
    docNumber: typeof e.docNumber === "string" ? e.docNumber : "",
    error: typeof e.error === "string" ? e.error : "",
  }));
}

/** Normaliza el `details` de un SyncLog. Devuelve null si la fila no tiene ninguno. */
export function parseSyncLogDetails(raw: unknown): SyncLogDetails | null {
  if (!isRecord(raw)) return null;
  return {
    fetchedIds: asStringArray(raw.fetchedIds),
    upsertErrors: asUpsertErrors(raw.upsertErrors),
    skipped: raw.skipped === true,
    mode: typeof raw.mode === "string" ? raw.mode : null,
  };
}
