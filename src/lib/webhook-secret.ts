/**
 * El secreto con el que Jira y Holded llaman a sus webhooks.
 *
 * Hasta ahora los dos aceptaban `CRON_SECRET` **o** `ERP_API_KEY`, y eso mezcla tres
 * cosas que no deberían compartir credencial:
 *
 * - `CRON_SECRET` es lo que Vercel pone en la cabecera de un cron nuestro. Vive en la
 *   configuración del proyecto.
 * - `ERP_API_KEY` era la clave maestra de la API de datos: sin dueño, sin caducidad y
 *   sin permisos. Es justo lo que el rediseño de acceso vino a retirar.
 * - El secreto de un webhook vive **en la configuración de un tercero** (el panel de
 *   Jira, el de Holded), que no controlamos y del que no podemos auditar quién lo ve.
 *
 * Compartirlos significa que quien saque el valor del panel de Jira puede además
 * disparar los crons y, mientras existió, leer la API entera. Por eso
 * `WEBHOOK_SYNC_SECRET` es propio y es el único que queda al final.
 *
 * Los dos antiguos se siguen aceptando **una ventana**, con un aviso en el log que dice
 * cuál se usó. Cuando el log esté limpio se borra la rama legacy: ese es el criterio,
 * no una fecha. Quitarlos hoy dejaría los webhooks mudos hasta que alguien entrase a
 * dos paneles externos a cambiar el valor, y nadie se enteraría salvo por los datos
 * que dejasen de llegar.
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
 * `origen` solo sirve para el aviso: es lo que permite leer en el log qué webhook sigue
 * configurado con la credencial vieja y, por tanto, a qué panel hay que entrar.
 */
export function webhookSecretValido(secret: string | null, origen: string): boolean {
  if (!secret) return false;

  const propio = process.env.WEBHOOK_SYNC_SECRET;
  if (propio && igual(secret, propio)) return true;

  const legacy: [string, string | undefined][] = [
    ["CRON_SECRET", process.env.CRON_SECRET],
    ["ERP_API_KEY", process.env.ERP_API_KEY],
  ];
  for (const [nombre, valor] of legacy) {
    if (valor && igual(secret, valor)) {
      console.warn(
        `[webhook:${origen}] autenticado con ${nombre}, credencial heredada. ` +
          "Cambia el secreto del webhook a WEBHOOK_SYNC_SECRET en el panel del proveedor.",
      );
      return true;
    }
  }

  return false;
}
