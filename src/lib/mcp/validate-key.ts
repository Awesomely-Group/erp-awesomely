import { resolveApiIdentity, type ApiIdentity } from "@/lib/api-keys";

/**
 * Resuelve una clave de API a lo que puede hacer **ahora mismo**.
 *
 * Delega entero en `resolveApiIdentity`, que comprueba revocación, caducidad, concesión
 * viva y pertenencia a la allowlist de SSO, y recalcula los scopes efectivos. Antes esto
 * se limitaba a buscar el hash: una clave revocada seguía abriendo la puerta, porque
 * "revocar" era borrar la fila y nada miraba `revokedAt`. Desde que revocar es marcar,
 * esa comprobación es obligatoria.
 *
 * `lastUsedAt` se escribe dentro, en cada petición: sin ese dato, retirar una credencial
 * es a ciegas.
 */
export async function resolveKey(key: string | null): Promise<ApiIdentity | null> {
  if (!key) return null;
  return resolveApiIdentity(key);
}

/**
 * Compatibilidad: sí/no, para los llamantes que todavía no usan la identidad.
 *
 * **El `ERP_API_KEY` de entorno sigue aceptado aquí de momento**, y es una clave maestra
 * sin dueño, sin caducidad y sin scopes — justo lo que este rediseño viene a quitar. Se
 * retira junto con `/api/v1` (fase siguiente), coordinado con los dos webhooks que lo
 * aceptan como alternativa a `CRON_SECRET`; quitarlo hoy, a la vez que todo lo demás,
 * multiplicaría el riesgo del despliegue sin ganar nada.
 */
export async function validateApiKey(key: string | null): Promise<boolean> {
  if (!key) return false;

  const envKey = process.env.ERP_API_KEY;
  if (envKey && key === envKey) return true;

  return (await resolveKey(key)) !== null;
}
