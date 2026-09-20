/**
 * Autenticación de la API del portal de cliente (plan 2026-09-20).
 *
 * Mismo mecanismo que el webhook de propuestas —secreto por marca en la cabecera
 * `x-webhook-secret`— pero con **secretos distintos** a propósito: el de propuestas
 * puede crear Budgets y disparar envíos a firmar, y una fuga del secreto de una API de
 * solo lectura no debe llevarse eso por delante.
 *
 * Y con prefijo propio `/api/portal/` en vez de colgar de `/api/webhooks/`: esto es
 * **salida** de datos de cliente, no eventos de entrada, y el allowlist de
 * `src/proxy.ts` es el sitio donde se audita qué se puede leer sin sesión.
 */
import { isProposalBrand, type ProposalBrand } from "./proposals-brand";
import { timingSafeEqual } from "node:crypto";

export type PortalBrand = ProposalBrand;

export { isProposalBrand as isPortalBrand };

/** Secreto por plataforma de marca. Nunca `ERP_API_KEY` ni `CRON_SECRET`. */
export function expectedPortalSecretFor(brand: PortalBrand): string | undefined {
  return brand === "SOLUTIONS"
    ? process.env.GIGSONAPPS_PORTAL_SECRET
    : process.env.LTTOOLS_PORTAL_SECRET;
}

/** Comparación en tiempo constante: el secreto lo elige quien llama y no cuesta nada. */
function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function authenticatePortalRequest(req: Request, brand: unknown): brand is PortalBrand {
  if (!isProposalBrand(brand)) return false;
  const provided = req.headers.get("x-webhook-secret");
  const expected = expectedPortalSecretFor(brand);
  if (!provided || !expected) return false;
  return secretsMatch(provided, expected);
}

/**
 * Una foto más vieja que esto se marca `stale`.
 *
 * Por defecto 30 h y no 24: el cron es diario, pero en el plan Hobby los crons tienen una
 * **ventana flexible de una hora**, así que dos pasadas seguidas pueden separarse hasta
 * ~25 h sin que pase nada raro. Marcar eso como viejo sería enseñarle al cliente un aviso
 * falso un día de cada dos. Un fallo de verdad (una pasada entera perdida) pasa de 48 h y
 * sí se ve.
 */
export const DEFAULT_SNAPSHOT_STALE_HOURS = 30;

export function snapshotStaleHours(): number {
  const raw = Number(process.env.PORTAL_SNAPSHOT_STALE_HOURS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_SNAPSHOT_STALE_HOURS;
}
