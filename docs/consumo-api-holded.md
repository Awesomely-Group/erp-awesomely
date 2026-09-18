# Consumo de la API de Holded

Holded factura por **llamadas a la API por periodo** y avisa por correo al 89% y
al 100% de la cuota del plan. Al llegar al 100% no bloquea las llamadas, pero el
consumo empuja a subir de plan.

Este documento explica de dónde salían las llamadas y cómo está montado ahora.

## El problema

El sync releía **toda la historia en cada ejecución**, no solo lo que había
cambiado. Por empresa y por ejecución:

| Llamada | Requests | Motivo |
|---|---|---|
| `/purchases` | ~81 | Una ventana mensual por mes desde `HOLDED_SYNC_FROM_YEAR` (2020) hasta hoy |
| `/ledger-entries` | ~105-525 | Un bucle por año, paginando de 200 en 200 líneas |
| `/salary-records/:id` | 1 por nómina | Se pedía el detalle de todas en cada sync |
| Resto (facturas, proformas, contactos, cuentas) | ~5-10 | Una sola llamada grande cada uno |

Total: **250-700 llamadas por empresa y ejecución**. Y se ejecutaba:

- una vez al día por el cron de las 06:00,
- cada vez que alguien pulsaba "Sincronizar" en el dashboard,
- **y una vez por cada webhook de Holded** (`/api/webhooks/holded` lanzaba un
  `syncAll` completo por evento) — este era el multiplicador grande.

El coste además crecía solo: cada enero añadía 12 ventanas de compras y un año
más de mayor, para siempre.

## Cómo está montado ahora

### Dos modos

- **`incremental`** (por defecto): relee **el ejercicio en curso entero**, del
  1 de enero a hoy. Si `HOLDED_INCREMENTAL_LOOKBACK_DAYS` (60 por defecto)
  alcanza más atrás, manda el lookback — es lo que pasa en enero y febrero, donde
  hay que seguir mirando el cierre del año anterior. Unas **10-20 llamadas** por
  empresa.
- **`full`**: relee toda la historia. Es el único que reconcilia borrados de
  ejercicios ya cerrados, porque es el único que los mira.

Se elige con `?mode=full` en `/api/sync` y `/api/sync/stream`.

**Por qué el año entero y no una ventana corta.** Una compra de febrero se puede
corregir, o borrar, en septiembre; hasta que no se relee ese periodo no hay forma
de enterarse. Con un lookback de 60 días, un borrado de marzo esperaba al sync
completo del domingo. Ahora lo coge el diario. Cuesta **2 llamadas más por
empresa** (`/purchases` pasa de 1 a 3), que con la paginación por cursor sale
prácticamente gratis — antes, con ventanas mensuales, releer el año entero
habría costado 9.

### Una ventana por listado, no una por mes

`/purchases` se troceaba en una ventana mensual por mes (~81 llamadas en modo
full) para esquivar el tope de 200 documentos por respuesta. Al comprobar que los
listados aceptan cursor, el troceo dejó de hacer falta: se pide **una sola
ventana de fechas** para todo el ámbito y se sigue el cursor. Ahora el número de
llamadas lo fija el volumen real de documentos, no el calendario:

| | Antes | Ahora |
|---|---|---|
| `/purchases`, modo full (974 compras, 2020→hoy) | 81 | 6 |
| `/purchases`, modo incremental (año en curso, ~300 compras) | 9 | 3 |

La ventana sigue terminando a **fin del mes en curso**, no hoy: las ventanas
mensuales ya incluían los documentos con fecha futura dentro del mes (facturas
recurrentes pre-generadas), y recortarlos los dejaría fuera del listado — el sync
los leería como borrados.

### Planificación (`vercel.json`)

| Cron | Cuándo | Modo |
|---|---|---|
| `/api/sync` | Lunes a sábado, 06:00 | incremental |
| `/api/sync?mode=full` | Domingos, 06:00 | full |
| `/api/notify/proformas` | Diario, 07:00 | — |

### Webhook

`/api/webhooks/holded` es incremental y tiene un **enfriamiento** de
`HOLDED_WEBHOOK_MIN_INTERVAL_MINUTES` (10 por defecto): los eventos que llegan
dentro de esa ventana se ignoran, porque el siguiente sync recogerá esos cambios
igualmente. Poner `0` desactiva el freno.

## La regla que no se puede romper

**La reconciliación de borrados solo es válida sobre lo que se ha pedido y ha
llegado entero.** Son dos condiciones distintas y las dos acaban en el mismo
sitio: un documento que no está en la lista se interpreta como borrado en Holded.

### 1. Ámbito: lo que no se ha preguntado

Si el sync incremental solo consulta los últimos dos meses, todo lo anterior *no
se ha preguntado* — y no haber preguntado no es lo mismo que "ya no existe". Por
eso, en modo incremental las compras, proformas y líneas de mayor anteriores a la
ventana quedan fuera de la comprobación de huérfanos. Las ventas se piden enteras
(sin filtro de fecha), así que se reconcilian en los dos modos. Los borrados
antiguos de lo demás los recoge el sync completo del domingo.

### 2. Integridad: lo que se ha pedido pero ha llegado a medias

Los listados de documentos de la v2 (`/invoices`, `/purchases`, `/proformas`)
**topan en 200 elementos por respuesta**, se pida el `limit` que se pida, y no
dan ningún error al truncar. Comprobado contra la API real con
`scripts/probe-holded-invoices-cap.ts` (17-09-2026):

| Comprobación | Resultado |
|---|---|
| Forma de la respuesta | `{ items, cursor, has_more }`, igual que `/ledger-entries` |
| `/purchases?limit=250` y `?limit=5000` | 200 elementos y `has_more: true` en ambos |
| `offset` y `page` | se ignoran: devuelven siempre la primera página |
| `cursor` | es el único modo de avanzar (`"page:2"`, `"page:3"`, …) |
| `start_date` / `end_date` | también funcionan en `/invoices`, y conviven con el cursor |

`/invoices` se pedía con una sola llamada y `limit=5000`. Con 88 y 185 facturas
de venta, las dos sociedades caben por debajo del tope y la lista llegaba
completa — de ahí el "no hard cap observed" del comentario. Al pasar de 200 la
respuesta se habría truncado en silencio y el sync habría marcado como
eliminadas, o borrado, las facturas que no cupieron.

El cursor es posicional (`"page:2"`) y el orden por defecto es por fecha
descendente, así que un documento creado mientras se pagina desplaza las páginas
siguientes y puede colar un salto. La API no ofrece un orden estable con el que
evitarlo —`sort=asc`, `sort=date_asc` y `sort=cualquier-cosa` devuelven todos el
mismo orden, que no es por fecha—, así que cuando un barrido ocupa más de una
página se vuelve a pedir la primera y se compara: si cambió, el listado se marca
incompleto. Cuesta una llamada y solo cuando hubo varias páginas.

Ahora todos los listados se recorren siguiendo el cursor y el cliente devuelve
además si la lista llegó entera (`HoldedDocumentList.complete`). Si no llegó:

- **se guarda lo recibido** — el upsert solo añade y actualiza, nunca quita;
- **no se reconcilia ni se borra nada** de ese tipo de documento (las ventas y
  las compras se evalúan por separado: que fallen las compras no invalida la
  foto de ventas);
- el sync se registra como **PARCIAL** en `/sync`, con el motivo en
  `errorMessage` y en `details.truncations`.

La salvaguarda vale incluso si Holded cambia el formato: una respuesta sin sobre
`{items, cursor, has_more}` que traiga exactamente tantos elementos como se
pidieron se da por truncada.

## Cómo medir el consumo

Cada ejecución registra lo que ha costado en `SyncLog.details`:

```json
{
  "mode": "incremental",
  "fromDate": "2026-07-01T00:00:00.000Z",
  "apiCalls": { "total": 14, "byEndpoint": { "/purchases": 3, "/ledger-entries": 4 } }
}
```

Y en los logs de la función:

```
[sync] company=… mode=incremental desde=2026-07-01 → 14 llamadas a la API de Holded
[sync] syncAll mode=incremental empresas=2 → 28 llamadas a la API de Holded
```

Para saber qué está disparando los syncs, mirar `SyncLog.triggeredBy`: `cron`,
`webhook:holded` o el email de quien pulsó el botón.

## Pendiente de decidir

`HOLDED_SYNC_FROM_YEAR` está en **2020** por defecto. El sync completo relee año
a año desde ahí, así que si la sociedad no tiene contabilidad anterior a, por
ejemplo, 2025, cada domingo se releen cinco ejercicios vacíos. Ajustarlo al
primer año real es una variable de entorno y recorta el coste del sync completo
de forma proporcional.
