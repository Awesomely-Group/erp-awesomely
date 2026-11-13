/**
 * El secreto con el que Jira y Holded llaman a sus webhooks.
 *
 * Es **propio**, `WEBHOOK_SYNC_SECRET`, y es el único que vale. Hasta noviembre de 2026
 * se aceptaban además `CRON_SECRET` y el antiguo `ERP_API_KEY`, por compatibilidad con
 * webhooks ya configurados; al revisar los paneles no había ninguno —ni en los dos
 * sitios de Jira, ni en las dos cuentas de Holded— apuntando a este ERP, así que no
 * había nada que romper y la rama se retiró.
 *
 * Por qué no se reutiliza `CRON_SECRET`, que es la tentación obvia: el secreto de un
 * webhook vive en la configuración de un tercero —el panel de Jira, el de Holded— que
 * no controlamos y del que no podemos auditar quién lo ve. `CRON_SECRET` es lo que
 * Vercel pone en la cabecera de nuestros propios crons. Compartirlos significaría que
 * quien saque el valor de un panel externo puede además disparar los crons.
 *
 * El sync de producción **no depende de estos webhooks**: va por los crons de
 * `vercel.json`. Son un disparador adicional.
 */
import { timingSafeEqual } from "node:crypto";

/**
 * Comparación en tiempo constante. `===` sobre un secreto se rinde en el primer byte
 * distinto, así que su duración filtra cuánto prefijo has acertado.
 */
function igual(a: string, b: string): boolean {
  const uno = Buffer.from(a);
  const otro = Buffer.from(b);
  if (uno.length !== otro.length) return false;
  return timingSafeEqual(uno, otro);
}

/**
 * ¿Puede este secreto disparar el sync de `origen`?
 *
 * Un rechazo **se registra**. El fallo de un webhook no tiene a nadie delante a quien
 * avisar: el síntoma es que los datos dejan de llegar, en silencio y puede que días
 * después. El log es lo único que convierte eso en algo diagnosticable, y dice de qué
 * proveedor venía para saber a qué panel entrar.
 */
export function webhookSecretValido(secret: string | null, origen: string): boolean {
  const propio = process.env.WEBHOOK_SYNC_SECRET;

  if (!propio) {
    console.warn(
      `[webhook:${origen}] rechazado: WEBHOOK_SYNC_SECRET no está configurado en este entorno.`,
    );
    return false;
  }

  if (secret && igual(secret, propio)) return true;

  console.warn(
    `[webhook:${origen}] rechazado: ${secret ? "el secreto no coincide" : "sin cabecera x-webhook-secret"}. ` +
      "Revisa el secreto en el panel del proveedor.",
  );
  return false;
}
