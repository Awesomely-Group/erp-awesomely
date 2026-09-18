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

### 4.1 CRM · `/api/crm/*`

Todas con `authenticateRequest()`. Prefijo a añadir en `src/proxy.ts`.

#### `GET /api/crm/leads`
Query: `marca`, `lineOfBusiness`, `funnelId`, `stageId`, `ownerId`, `origin`, `market`,
`companyId`, `closeFrom`, `closeTo`, `page`, `limit`.
Respuesta: `{ data: CrmLead[], total, page, limit }` — cada lead con `funnel { id, name,
lineOfBusiness }`, `account { id, name }` y `owner { id, name }`.

#### `GET /api/crm/leads/[id]`
Lead + `funnel`, `account`, `activities`, `budgets` (con `documensoStatus`) y `stageHistory`.
`404` si no existe.

#### `PATCH /api/crm/leads/[id]`
Body: **solo campos propios del ERP** — `marca`, `ownerId`, `accountId`, `expectedCloseDate`,
`probability`, `origin`, `market`, `seats`, `notes`.
Si el body trae campos espejados de Holded (`name`, `amount`, `stageId`, `email`…) → `400`
indicando que se editan en Holded o, para la etapa, en el endpoint de abajo. Esto es lo que
mantiene la disciplina de espejo: el sync nunca debe encontrarse valores del ERP en sus columnas.

#### `POST /api/crm/leads/[id]/stage`
Body: `{ stageId: string }`. Efecto: escribe en Holded (`/leads/{leadId}/stages`), **relee el
lead** para confirmar, guarda `CrmLeadStageEvent { source: "ERP" }` y `AuditLog`.
Idempotente: si ya está en esa etapa, `200` sin efectos secundarios.
`409` si Holded rechaza la transición · `502` si la API de Holded falla (no dejar el espejo
divergente: si falla la escritura, no se escribe el evento).

#### `GET /api/crm/funnels`
Query: `marca`, `companyId`, `lineOfBusiness`. Devuelve los embudos espejados con sus etapas
(`stages` tal cual vienen de Holded) — es lo que alimenta las columnas del tablero.

#### `GET /api/crm/accounts` · `GET /api/crm/accounts/[id]`
Listado con `marca`, `lifecycle`, `ownerId`, `q` (nombre/dominio/CIF) + paginación.
El detalle es la ficha 360: contactos, leads, presupuestos, proformas, facturas y proyectos,
resueltos por `(companyId, holdedContactId)`.

#### `GET|POST /api/crm/activities` · `PATCH /api/crm/activities/[id]`
Filtros: `ownerId`, `leadId`, `accountId`, `dueBefore`, `pending=true`.
`POST` crea nota/llamada/reunión/tarea; `PATCH` marca `completedAt`.

#### Sincronización — sin endpoint propio
`syncHoldedCrm(companyId)` se engancha en `syncAll()` (`src/lib/sync.ts`), que ya corre en el
cron de `/api/sync` (06:00, `vercel.json`). **No crear `/api/crm/sync`**: duplicaría orquestación
y consumiría cuota de la API de Holded fuera de control.

### 4.2 KPIs comerciales

#### `GET /api/kpis?type=commercial`
Añadir el caso al `switch` de `src/app/api/kpis/route.ts` y `getCommercialKPIs()` a
`src/lib/kpis/` (mismo patrón que `getPLKPIs`/`getCashflowKPIs`, exportado desde `index.ts` y
sumado a `getAllKPIs`).

Ampliar `KPIFilters` (`src/lib/kpis/types.ts`) con `lineOfBusiness?` y `funnelId?`: **agregar solo
por `marca` no distingue las dos líneas de Gigson** (Integraciones/IA y Odoo), que tienen embudos
y metas distintas — mezclarlas invalida las conversiones.

Respuesta: `{ commercial: { leadsByMonth, demos, proposals, conversionByStage, avgCycleDays,
avgTicket, winRate, weightedPipeline, byOrigin, seats }, generatedAt }`.

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
| `list_leads` | leads con los filtros de `GET /api/crm/leads` |
| `get_lead` | detalle con actividades y propuestas |
| `get_pipeline` | embudo agregado por etapa (conteo + importe + ponderado), filtrable por marca y línea |
| `list_crm_accounts` | cuentas con su lifecycle y último movimiento |

Y ampliar `get_kpis` (`tools/kpis.ts`) para aceptar `lineOfBusiness` y devolver el grupo
comercial. Subir `version` del servidor MCP al añadir tools (hoy `"1.0.0"` fija).

### 4.4 `src/proxy.ts`

```ts
p.startsWith("/api/crm/") ||
p.startsWith("/api/kpis") ||   // cubre /api/kpis y /api/kpis/targets
```

Conviene aprovechar para pasar la lista de igualdades exactas a prefijos: hoy `/api/kpis` está
por igualdad, así que `/api/kpis/targets` **no** quedaría cubierto.

## 5. Checklist para añadir un endpoint

1. `authenticateRequest()` + `unauthorized()` como primera línea del handler.
2. Añadir la ruta (o su prefijo) a `isApiInternal` en `src/proxy.ts`.
3. Respuesta con `json({ data, total })`; paginar si el listado puede crecer.
4. Tipos de retorno explícitos; sin `any`.
5. Si muta datos, escribir `AuditLog`.
6. Si escribe en Holded, releer para confirmar y no dejar el espejo divergente.
7. Documentar aquí la ruta nueva.

## 6. Verificación

- `pnpm typecheck && pnpm lint && pnpm test` (lo mismo que corre CI).
- Con sesión abierta, desde el navegador: `/api/crm/leads?marca=LaTroupe`.
- Con API key, que es donde se nota si falta el paso 2 del proxy:
  `curl -H "x-api-key: $KEY" https://<preview>/api/crm/leads` → debe devolver JSON, no el HTML
  de `/login`. Ese redirect es el síntoma exacto de haber olvidado `src/proxy.ts`.
- MCP: listar tools contra `/api/mcp` y comprobar que aparecen las de CRM.
- Cambio de etapa: `POST /api/crm/leads/<id>/stage` → confirmar en Holded que el lead se movió y
  que se creó un único `CrmLeadStageEvent`; repetir la misma llamada y comprobar que es
  idempotente.
