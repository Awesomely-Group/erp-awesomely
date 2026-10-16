# API del ERP — contrato y convenciones

> Estado: inventario **verificado contra el código** (2026-09-18) + delta propuesto para las
> secciones nuevas de CRM y KPIs comerciales.
> Relacionado: `docs/plan-crm.md` (módulo CRM), `docs/proposals-plan-v2.md` (webhooks de
> propuestas).

## 1. Autenticación — cuatro mecanismos

| Mecanismo | Cabecera | Se valida contra | Usado en |
|---|---|---|---|
| Sesión SSO **o** API key | `x-api-key` | `authenticateRequest()` → modelo **`ApiKey`** en BD (`keyHash`, revocable, registra `lastUsedAt`) | 10 rutas de datos (ver §3) |
| Solo sesión SSO | cookie | `await auth()` dentro de la ruta | `debug-*`, `fix-*`, `/api/holded/*`, `/api/jira/users`, `/api/tempo/worklogs`, `/api/invoices/search` |
| API key suelta | `x-api-key` | `process.env.ERP_API_KEY` (comprobación propia de la ruta) | `/api/kpis` |
| Secreto por plataforma | `x-webhook-secret` | `expectedSecretFor(brand)` (`src/lib/proposals-brand.ts`) | `/api/webhooks/proposals/*` |
| Cron | `Authorization: Bearer $CRON_SECRET` | env | `/api/sync`, `/api/notify/proformas`, `/api/debug-accounts` |

**Deuda conocida:** hay dos formas de validar `x-api-key`. Lo correcto es `authenticateRequest()`
—valida contra el modelo `ApiKey`, que es revocable y registra `lastUsedAt`— y migrar `/api/kpis`
a ese helper. **Toda ruta nueva usa `authenticateRequest()`.**

### Regla de oro: el bypass del middleware NO autentica

`src/proxy.ts` mantiene una lista (`isApiInternal`) de rutas que **saltan el redirect a
`/login`**. Eso es lo único que hace: no comprueba credenciales. De ahí que el patrón real sea de
**dos pasos**, y hay que hacer los dos:

1. Añadir la ruta a `isApiInternal` en `src/proxy.ts` — si no, en producción el middleware
   redirige a `/login` y el endpoint nunca devuelve JSON a un cliente con API key.
2. Comprobar la credencial **dentro** de la ruta — si no, el endpoint queda abierto.

Así están hoy `debug-accounts` (valida `CRON_SECRET` dentro) y `fix-marca` / `fix-domains` /
`debug-contacts` (validan sesión dentro). Es correcto; hay que mantenerlo.

Nota: la lista de `isApiInternal` compara por **igualdad exacta** (`p === "/api/cashflow"`), con
solo dos prefijos (`/api/projects/`, `/api/webhooks/`). Al añadir un árbol de rutas nuevo hay que
añadir su prefijo explícitamente.

## 2. Convenciones

Helpers en `src/lib/api-auth.ts`: `authenticateRequest()`, `unauthorized()`, `badRequest(msg)`,
`notFound(msg)`, `json(data, status)`.

```ts
export async function GET(req: Request): Promise<Response> {
  if (!(await authenticateRequest(req))) return unauthorized();
  // …
  return json({ data, total });
}
```

- **Respuesta de listado**: `{ data: T[], total: number }` (ver `/api/forecasts`). Cuando hay
  paginación se añaden `page` y `limit`.
- **Paginación**: query `page` (mín. 1, default 1) y `limit` (default 50, **tope 100**), como en
  `/api/invoices`. Los listados que pueden crecer sin límite deben paginar.
- **Filtros**: se construyen con *spread* condicional sobre el `where` de Prisma
  (`...(marca ? { marca } : {})`).
- **Fechas**: ISO `YYYY-MM-DD` en query; `new Date(...)` en el handler.
- **Tipos**: retorno explícito `Promise<Response>`; nunca `any` (usar `unknown` y estrechar);
  `??` en vez de `||` (ver `CLAUDE.md`).

## 3. Inventario actual (verificado)

**Datos de negocio — aceptan API key** (`authenticateRequest`, 10 rutas):
`GET /api/invoices` · `POST /api/invoices/[id]/classify` ·
`POST /api/invoices/[id]/classify-lines` · `GET /api/invoices/[id]/pdf` ·
`GET /api/projects` · `PATCH /api/projects/[projectId]/status` · `GET /api/cashflow` ·
`GET /api/forecasts` · `GET /api/suppliers/verifications` · `GET /api/payroll/[id]/pdf`

**Solo sesión** (`await auth()`, sin API key): `GET /api/invoices/search` ·
`GET /api/projects/[projectId]/hour-buckets` · `GET /api/projects/[projectId]/user-roles` ·
`GET /api/holded/accounts` · `GET /api/holded/contacts` · `GET /api/jira/users` ·
`GET /api/tempo/worklogs` · `POST /api/forecasts`

> **Inconsistencia a tener en cuenta al consumir la API**: rutas hermanas no comparten
> mecanismo. `/api/invoices` acepta API key pero `/api/invoices/search` no; `/api/projects` y
> `/api/projects/[projectId]/status` sí, pero `hour-buckets` y `user-roles` no. Un cliente con
> API key (app de marca, agente MCP) recibe `401` en esas rutas sin motivo aparente. No es
> urgente arreglarlo, pero las rutas nuevas de CRM deben ser homogéneas: **todas**
> `authenticateRequest()`.

**KPIs**: `GET /api/kpis?type=pl|cashflow|derived|projections|all` con filtros `year`,
`dateFrom`, `dateTo`, `companyId`, `marca`.

**Integración / sistema**: `POST|GET /api/sync` · `POST /api/sync/stream` ·
`POST /api/sync-document` · `GET /api/sync-logs/[id]` · `GET|POST /api/notify/proformas` ·
`GET /api/holded/accounts` · `GET /api/holded/contacts` · `GET /api/jira/users` ·
`GET /api/tempo/worklogs` · `POST /api/mcp` · `/api/auth/[...nextauth]`

**Webhooks** (bypass de sesión por prefijo, secreto propio):
`POST /api/webhooks/proposals` · `GET /api/webhooks/proposals/[budgetId]/status` ·
`GET|POST /api/webhooks/proposals/contacts` · `POST /api/webhooks/documenso` ·
`POST /api/webhooks/holded` · `POST /api/webhooks/jira`

**Mantenimiento** (sesión o cron dentro de la ruta): 9 × `debug-*`, 3 × `fix-*`.

**MCP** (`src/lib/mcp/server.ts`, `name: "erp-awesomely"`, `version: "1.0.0"`): 6 grupos —
`projects`, `invoices`, `kpis`, `suppliers`, `budgets`, `cash-balance`.

## 4. Delta — secciones nuevas

### 4.1 CRM — no hay API de escritura, y es a propósito

**Esta sección describía nueve endpoints `/api/crm/*` que se decidió NO construir** (PR #44).
El CRM se opera desde su propia UI con server actions; abrir una superficie de escritura HTTP
para una carga que se hace cuatro veces en la vida no se paga sola, y cada endpoint habría que
autenticarlo, versionarlo y mantenerlo. La carga inicial entra por `scripts/import-crm.ts`.

Lo que sí existe, y es todo lo que el CRM expone hacia fuera:

#### `POST /api/webhooks/leads`
Entrada única de **leads** para Growth (D7): formularios de gigsonsolutions.com y
latroupestudio.com, y el Workflow nativo de Apollo. Auth por `x-webhook-secret` contra
`LEADS_WEBHOOK_SECRET`. Idempotente por `(source, externalRef)` → `200` con
`{ leadId, idempotent: true }` si ya existía; `201` si es nuevo.

Body: `source` (`WEB_GIGSON|WEB_LATROUPE|APOLLO|REFERIDO|OTRO`), `externalRef`, `name`, `marca`
obligatorios; al menos uno de `email`/`phone`. Opcionales: `lineOfBusiness` (default `GENERAL`),
`contactName`, `amount`, `seats`, `origin`, `market`, `campaignSource`, `notes`, y la atribución de
campaña (2026-10-16): `utmSource`, `utmMedium`, `utmCampaign`, `utmTerm`, `utmContent`, `gclid`
(o `gbraid`/`wbraid`, que se guardan en la misma columna con prefijo), `formId` (el `form_id` del
formulario de la web: `consultoria-odoo`, `iso27001`, `home`…) y `landingPage`.

Con esos campos el lead se atribuye solo a una campaña de pago (`CrmLead.adCampaignId`, ver
`src/lib/ads-attribution.ts`): por `utmCampaign` exacto contra una `AdCampaign` mapeada, o por
`formId` si el formulario es de una única campaña viva **y** el lead trae gclid o `utm_medium` de
pago. Si el formulario lo comparten varias campañas, queda sin atribuir y se vincula a mano desde
`/campanas/[id]` o la ficha del lead. La respuesta `201` incluye `adCampaignId` y `attribution`
(`utm_campaign|form_id|ambiguous|none`).

El lead entra como `NEW`, **sin etapa y sin dueño**. No entra en el embudo: desde la separación
lead/deal (2026-10-13) el embudo es de oportunidades, y la oportunidad nace al cualificar el lead
desde la UI. `amount` y `seats` se guardan como lo *declarado* (`CrmLead.estimatedAmount`,
`CrmLead.seats`) y siembran la primera oportunidad; la cifra con la que se hace previsión es
`CrmDeal.amount`, que confirma el comercial.

#### `POST /api/webhooks/proposals` y sus rutas hermanas
`POST /api/webhooks/proposals` · `GET /api/webhooks/proposals/[budgetId]/status` ·
`GET|POST /api/webhooks/proposals/contacts`.

El campo que enlaza la propuesta con el CRM es **`crmDealId`** (antes `crmLeadId`): una propuesta
es siempre de una oportunidad, porque un lead sin cualificar no tiene ni importe ni cuenta a la
que facturar. Al crearse, mueve esa oportunidad a la etapa "Propuesta enviada" de su embudo
(marca + línea de negocio), best-effort: si la etapa no está sembrada, el presupuesto se crea
igual y se registra el fallo en consola.

`/proposals/contacts` es el único punto donde el CRM escribe en Holded: da de alta el contacto
fiscal al preparar la propuesta (D3).

#### `POST /api/webhooks/documenso`
Firma de la propuesta. Auth por `X-Documenso-Secret` **en claro** contra
`DOCUMENSO_WEBHOOK_SECRET` — Documenso no firma el cuerpo con HMAC, así que no hay firma que
verificar; la comparación es en tiempo constante sobre el digest SHA-256 de ambos valores.
Al firmarse genera la comisión `PROPOSAL_PERCENT` sobre `budget.crmDeal` si su marca tiene una
`CommissionRule` activa.

#### Sincronización — no hay
El pipeline no se sincroniza con ningún sistema externo (D4, `docs/plan-crm.md`).

### 4.2 KPIs comerciales

#### `GET /api/kpis?type=commercial`
Implementado en `src/lib/kpis/commercial.ts`, mismo patrón que `getPLKPIs`/`getCashflowKPIs`.
`KPIFilters` acepta `marca`, `lineOfBusiness` y `dealType`: **agregar solo por `marca` no
distingue las dos líneas de Gigson** (Integraciones/IA y Odoo), que tienen embudos y metas
distintas — mezclarlas invalida las conversiones.

`dealType` **no se aplica por defecto**: el pipeline ponderado es dinero real y una ampliación de
retainer cuenta igual que una venta nueva. Para medir objetivos de captación ("9 implantaciones de
Odoo el año 1") hay que pasarlo explícitamente, porque los 7 frentes de un retainer inflarían la
cuenta. El desglose `dealsByType` sale siempre.

Mide **dos embudos encadenados** (separación lead/deal, 2026-10-13):

| Del lead | Del deal |
|---|---|
| `leadsCreated`, `leadsByOrigin` | `dealsCreated`, `dealsByType` |
| `leadsQualified`, `qualificationRatePct` | `wonCount`, `lostCount`, `winRatePct` |
| `avgTimeToQualifyDays` | `avgDealSize`, `avgCycleDays`, `weightedPipeline`, `funnel` |

`qualificationRatePct` se cuenta sobre los leads **entrados** en el periodo, no sobre los
cualificados en él: la pregunta es qué parte de lo que entró sirvió para algo, y un lead de
diciembre que cualifica en enero cuenta en diciembre, que es donde está su coste de captación.

`avgCycleDays` mide la oportunidad (de crearse a ganarse) y no incluye lo que el lead tardó en
cualificarse: eso es `avgTimeToQualifyDays`, que mide otra cosa y normalmente lo hace otra
persona. Solo cuenta los deals nacidos de un lead — los que vienen de un cliente que ya está
dentro no pasaron por cualificación, y meterlos como 0 días bajaría la media de algo que no han
hecho.

#### `GET|PUT /api/kpis/targets`
CRUD de `KpiTarget` (`metric`, `marca`, `lineOfBusiness?`, `periodType` MONTH|QUARTER|YEAR,
`periodKey`, `value`). `PUT` hace upsert por
`(metric, marca, lineOfBusiness, periodType, periodKey)`.
Alimenta el semáforo Verde (≥meta) / Amarillo (70-99%) / Rojo (<70%). Las metas se editan, no se
cablean: las cifras del plan de Odoo salen de una plantilla sin aprobar.

### 4.3 MCP

Nuevo `src/lib/mcp/tools/crm.ts` con `registerCrmTools(server)`, registrado en `server.ts`:

| Tool | Devuelve |
|---|---|
| `list_deals` | oportunidades por marca, línea, etapa, cuenta o tipo |
| `get_deal` | detalle con actividades, propuestas y las otras oportunidades de la cuenta |
| `list_leads` | leads sin cualificar, filtrables por estado y origen |
| `get_pipeline` | embudo agregado por etapa (conteo + importe + ponderado), filtrable por marca y línea |
| `list_crm_accounts` | cuentas con su lifecycle y último movimiento |

Y ampliar `get_kpis` (`tools/kpis.ts`) para aceptar `lineOfBusiness` y devolver el grupo
comercial. Subir `version` del servidor MCP al añadir tools (hoy `"1.0.0"` fija).

### 4.4 `src/proxy.ts`

```ts
p.startsWith("/api/kpis") ||   // cubre /api/kpis y /api/kpis/targets
```

Ya no hace falta `/api/crm/` (ver §4.1: no hay API de escritura del CRM). Los webhooks van por el
bypass de prefijo `/api/webhooks/`, que ya está.

Conviene aprovechar para pasar la lista de igualdades exactas a prefijos: hoy `/api/kpis` está
por igualdad, así que `/api/kpis/targets` **no** quedaría cubierto.

### 4.5 Campañas de pago — `POST /api/webhooks/ads-metrics`

Entrada de **métricas de Google Ads** para Growth > Campañas (`/campanas`, 2026-10-16). La llama
un Google Ads Script que corre dentro de la propia cuenta de Ads (`scripts/google-ads/push-metrics.js`,
instalación en `scripts/google-ads/README.md`): sin developer token ni OAuth, el ERP solo recibe.
Sustituye a la integración por API que quedó pausada en `marketing-google-ads-wip`; sus tablas
`google_ads_*` (vacías) se borraron en la migración `20261016120000_add_ads_campaigns`.

Auth por `x-webhook-secret` contra `ADS_WEBHOOK_SECRET` (un solo secreto, como `/webhooks/leads`).
Contrato en `src/lib/ads-webhook.ts` (zod, `discriminatedUnion("kind")`); escritura en
`src/lib/ads-ingest.ts`.

Body común: `kind` (`campaigns|keywords|search_terms`), `runId` (uno por ejecución del script),
`scriptVersion`, `account{externalId (10 dígitos sin guiones), name, currency}`, `dateFrom`/`dateTo`
(`YYYY-MM-DD`, fecha local de la cuenta), `part`/`parts`, `rows[]` (≤ 5.000). `kind=campaigns`
añade `campaigns[]` (externalId, name, status, dailyBudgetEur) y sus `rows` son una por campaña y
día (impresiones, clics, `costEur`, `conversions`, `conversionValueEur`, `dailyBudgetEur`, cuotas de
impresiones 0-1 o `null`). `keywords` y `search_terms` llevan una fila por elemento y día. Importes
**ya en EUR**; el script convierte los micros.

Semántica: **idempotente por borrado y reinserción** de las combinaciones (campaña, día) que trae el
lote, en una transacción — repetir un POST deja la base igual, y los días que no vienen en ningún
lote no se tocan. Las campañas se crean/actualizan (nombre, estado, presupuesto) con el lote de
`campaigns`; si llegan keywords o términos de una campaña desconocida, se crea mínima para no perder
filas. **Nunca toca el mapeo manual** de la campaña (marca, línea de negocio, `formIds`,
`utmCampaign`): eso se edita en `/campanas`.

Respuestas: `200 { importId, kind, part, parts, rowsReceived, rowsUpserted, campaignsCreated[] }`;
`400 { error, issues[] }` si el payload no pasa el contrato; `401` sin secreto; `500 { error }` si
falla la escritura. Cada POST deja una fila en `ads_imports` (también los fallidos) — es lo que
`/campanas` usa para "actualizado hace N horas" y para avisar si el script dejó de llegar.

El webhook de leads (`/webhooks/leads`) acepta desde la misma revisión `gclid` (o `gbraid`/`wbraid`),
`utmTerm`, `utmContent`, `formId` y `landingPage`, y rellena `CrmLead.adCampaignId` cuando
`utmCampaign` o `formId` casan con una campaña mapeada — ver §4.1.

## 5. Checklist para añadir un endpoint

1. `authenticateRequest()` + `unauthorized()` como primera línea del handler.
2. Añadir la ruta (o su prefijo) a `isApiInternal` en `src/proxy.ts`.
3. Respuesta con `json({ data, total })`; paginar si el listado puede crecer.
4. Tipos de retorno explícitos; sin `any`.
5. Si muta datos, escribir `AuditLog`.
6. Si escribe en Holded (solo el alta de contacto fiscal), releer para confirmar.
7. Documentar aquí la ruta nueva.

## 6. Verificación

- `pnpm typecheck && pnpm lint && pnpm test` (lo mismo que corre CI).
- Webhook de leads, que es donde se nota si falta el paso 2 del proxy:
  `curl -X POST -H "x-webhook-secret: $LEADS_WEBHOOK_SECRET" -H "Content-Type: application/json" \
  -d '{"source":"WEB_GIGSON","externalRef":"prueba-1","name":"Prueba","marca":"Gigson Solutions","email":"a@b.c"}' \
  https://<preview>/api/webhooks/leads` → `201` con `{ leadId }`. Repetir la misma llamada: debe
  devolver `200` con `idempotent: true` y **no** crear un segundo lead. Si sale el HTML de
  `/login` en vez de JSON, falta la ruta en `src/proxy.ts`.
- MCP: listar tools contra `/api/mcp` y comprobar que aparecen las de CRM.
- Cualificación, desde la UI: en `/crm/leads`, abrir el lead de prueba → "Cualificar". Comprobar
  que aparece en el tablero `/crm`, que el lead queda en `QUALIFIED` con `convertedAt`, y que
  volver a cualificarlo crea una **segunda** oportunidad sin tocar `convertedAt`.
