# Volcado de Google Ads al ERP (`push-metrics.js`)

Cómo llegan las métricas de campañas a `/campanas` del ERP: un **Google Ads Script** que
corre dentro de la propia cuenta de Ads cada madrugada y hace `POST /api/webhooks/ads-metrics`.
Sin developer token, sin OAuth, sin cron en Vercel. El ERP solo recibe.

El fichero `push-metrics.js` de esta carpeta es la copia de referencia: lo que esté pegado en
Google Ads tiene que ser esto. Si se cambia, se cambia aquí primero.

## Instalación (una vez, ~10 minutos)

1. **Secreto en el ERP.** Añadir `ADS_WEBHOOK_SECRET` (una cadena larga aleatoria,
   p.ej. `openssl rand -hex 32`) a las variables de entorno de producción en Vercel y
   redesplegar. Sin la variable el webhook responde 401 a todo.
2. **Script en Google Ads.** Entrar en la cuenta `827-209-7041 · Gigson Solutions (España)`
   (hace falta acceso de *administrador* o *estándar*; Holdmin lo tiene desde su MCC) →
   Herramientas → Acciones en bloque → **Secuencias de comandos** (así traduce Google
   "Scripts") → `+` → se abre el editor con un `function main() {}` vacío.
3. **Pegar y rellenar.** Borrar ese contenido, pegar `push-metrics.js` entero y, en el bloque
   `CONFIG` del principio, sustituir `PEGA_AQUI_EL_SECRETO` por el valor de
   `ADS_WEBHOOK_SECRET` de Vercel. `ERP_URL` ya apunta a producción. El editor de Google
   Ads no tiene pantalla de propiedades: el secreto vive solo en esa copia, nunca en el repo.
   Nombre sugerido: `ERP · push-metrics`.
4. **Autorizar y previsualizar.** `Vista previa` la primera vez pide autorizar el script
   (lectura de la cuenta + `UrlFetchApp` + correo). La vista previa **sí envía** los POST:
   es la prueba de extremo a extremo. En el registro tienen que salir tres líneas `OK`
   (`campaigns`, `keywords`, `search_terms`) y en `/campanas` del ERP aparecen las campañas.
5. **Programar.** Frecuencia *Diaria*, hora `04:00` (zona horaria de la cuenta). Google Ads
   consolida el día anterior de madrugada; a las 04:00 ya está.

## Qué envía

Tres lotes por ejecución, cada uno troceado en partes de 2.000 filas como máximo, siempre
sobre la ventana `[hoy − LOOKBACK_DAYS, ayer]`:

- `campaigns`: metadatos (nombre, estado, presupuesto diario) + una fila por campaña y día
  con impresiones, clics, coste, conversiones, valor de conversión y cuotas de impresiones
  (`search_impression_share`, perdida por presupuesto, perdida por ranking).
- `keywords`: una fila por keyword y día (`keyword_view`), solo con impresiones > 0. El
  `quality_score` solo va en la fila del último día: es un valor actual, no histórico.
- `search_terms`: una fila por término de búsqueda real, grupo de anuncios, tipo de
  concordancia con que casó y día (`search_term_view`).

Los importes van ya en **EUR** (el script divide los micros de Google); las fechas, en la
zona horaria de la cuenta y sin hora. El contrato exacto está en `src/lib/ads-webhook.ts`
(zod) y documentado en `docs/api-erp.md` §4.5. Los ficheros de `fixtures/` son ejemplos
válidos de los tres lotes; sirven para el test del contrato y para probar el webhook a mano:

```bash
curl -s -X POST http://localhost:3000/api/webhooks/ads-metrics \
  -H 'content-type: application/json' \
  -H "x-webhook-secret: $ADS_WEBHOOK_SECRET" \
  --data @scripts/google-ads/fixtures/campaigns.json
```

## Por qué reescribe 60 días en vez de añadir el día de ayer

Google Ads va rellenando las conversiones hacia atrás durante varios días (y a veces
corrige clics inválidos). Si el script añadiera solo la fila de ayer, la semana pasada se
quedaría congelada con cifras incompletas. Por eso cada ejecución vuelve a mandar la
ventana entera y el ERP borra y reinserta las combinaciones (campaña, día) que recibe.
Repetir una ejecución no duplica nada.

Para un backfill puntual más largo (p.ej. traer el histórico de agosto), poner
`LOOKBACK_DAYS: 365` en `CONFIG`, ejecutar una vez a mano y devolverlo a `60`.

## Si algo falla

- **401 en todos los lotes**: el secreto de `CONFIG` no coincide con `ADS_WEBHOOK_SECRET` de Vercel.
- **400 con `issues`**: el payload no pasa el contrato; el mensaje dice qué campo. Suele ser
  una versión vieja del script frente a un ERP nuevo (o al revés): comparar `SCRIPT_VERSION`.
- **La consulta GAQL de campañas falla por las cuotas de impresiones** (cuentas con muy poco
  volumen): quitar los tres campos `metrics.search_*_impression_share` de `readCampaignDaily`
  y las tres claves correspondientes del objeto; el ERP admite `null` en esas columnas.
- **`quality_score` falla con `segments.date`**: quitarlo de la consulta de keywords y dejar
  `qualityScore: null`; la matriz de keywords lo mostrará como "—".
- **En `/campanas` sale "El script no ha enviado datos desde…"**: mirar el historial de
  ejecuciones del script en Google Ads (Scripts → Historial). La ejecución diaria puede
  haberse desactivado si falló la autorización.
