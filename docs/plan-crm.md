# Plan: CRM en erp-awesomely

> Estado: propuesta para revisión. Decisiones de alcance tomadas el 2026-09-17 (ver
> "Decisiones de alcance").
>
> **Fuentes externas al repo que gobiernan este plan** (encontradas el 2026-09-17; el plan
> comercial ya existía, solo no estaba en el repositorio):
> - Confluence `GS - GENERAL` · [Estrategia de Comunicación, Marketing y Ventas — Awesomely
>   Group (2026)](https://gigsonsolutions.atlassian.net/wiki/spaces/4b7d8876a83040e982e49eda8189915d/pages/342458370)
>   (act. 2026-06-17, Jaume + Emmelin) — §7.1 funnel unificado y §10 stack: **CRM = Holded**.
> - Confluence · [Holded API — Recursos y herramientas
>   MCP](https://gigsonsolutions.atlassian.net/wiki/spaces/4b7d8876a83040e982e49eda8189915d/pages/321978369)
>   — Holded expone `api/crm/v1`: `GET /leads`, `GET /funnels`.
> - Confluence · [Playbook: API de
>   Holded](https://gigsonsolutions.atlassian.net/wiki/spaces/4b7d8876a83040e982e49eda8189915d/pages/322109441)
>   (act. 2026-05-19) — límites de cuota, ausencia de webhooks, campos de auditoría reales.
>
> Relacionados en el repo: `docs/proposals-plan-v2.md` (contrato de propuestas, implementado a
> medias), `docs/plan-revision-reunion-2026-09-03.md` (E10, E11, E12).

## Contexto

Desde la reunión del 2026-09-03 el sidebar reserva una subsección **"CRM" vacía a propósito**
(`src/components/sidebar.tsx:55`, comentario en l.43-44) y nunca se desarrolló nada detrás.
Pero el proceso comercial **sí estaba definido** — fuera del repo, en la estrategia de H2 2026:

- El funnel unificado de ambas marcas (§7.1) arranca con **"Lead identificado → Registrar en
  Holded CRM con fuente, contacto, contexto"** (responsable: BDR / Emmelin).
- El stack (§10) fija **CRM: Holded**, prospección **Apollo.io + LinkedIn Sales Navigator**,
  grabación de reuniones **ReadAI**, nurture por email en Holded.
- Las conversiones objetivo ya están fijadas (§8): contacto→respuesta >15%, respuesta→discovery
  >60%, discovery→propuesta >70%, propuesta→cierre >40%, ticket medio €20–35K (Gigson).

Es decir: no falta el proceso, falta que el ERP lo vea. Hoy el ciclo comercial es invisible
para el ERP hasta que aparece una proforma, y el presupuesto (`/budgets`) **exige un proyecto de
Jira ya existente**, así que solo se puede presupuestar a quien ya es cliente con proyecto
abierto.

Este plan conecta ese proceso ya definido con el ERP, sin inventar un CRM paralelo.

## Decisiones de alcance

| # | Decisión | Implicación |
|---|----------|-------------|
| D1 | **CRM completo de una tanda**: cuentas + contactos + pipeline + actividades | Se planifica por fases pero el alcance es el CRM entero, no un MVP de ficha de cliente |
| D2 | **El generador de propuestas vive en las apps de marca** (`gigsonapps.com` / `latroupeapps.com`) | El ERP **no** construye configurador. E11 ("rehacer Presupuestos como generador") se resuelve así: `/budgets` queda como vista interna de lectura/enlace; el ERP expone API + Holded + firma, como ya define `docs/proposals-plan-v2.md` |
| D3 | **El lead nace en Apollo**; el contacto en Holded se crea **solo al preparar la propuesta** | Ver nota de reconciliación abajo: encaja con la estrategia porque *lead* y *contacto* son dos objetos distintos en Holded |
| D4 | **Holded CRM es el sistema de registro del pipeline; el ERP lo espeja y lo enriquece** | Se deriva de §10 de la estrategia ("CRM: Holded") y del patrón que ya usa todo el ERP (facturas, proformas, asientos, empleados). Alternativa descartada por defecto: que el ERP sea dueño del pipeline y Holded solo el buzón de entrada — contradice la estrategia vigente y crearía dos pipelines |

### Reconciliación de D3 con la estrategia (no hay conflicto)

Parecía que D3 ("el lead nace en Apollo") contradecía el funnel ("registrar en Holded CRM"),
pero son **dos objetos distintos de Holded**:

- **Lead** = `api/crm/v1/leads` — objeto de CRM, sin datos fiscales. Aquí entra el lead desde el
  primer momento, como dice el funnel.
- **Contacto** = `api/invoicing/v1/contacts` — objeto fiscal (CIF, dirección) necesario para
  facturar. Se crea **al preparar la propuesta**, como dice D3, con el `createContact()` que ya
  existe (`src/lib/holded.ts:1027`).

Por tanto: Apollo construye la lista → el lead se registra en Holded CRM → el ERP lo espeja →
al preparar propuesta se crea el contacto fiscal. Todo encaja sin duplicar nada.

**Consecuencia práctica:** Apollo sale de la ruta crítica del ERP. No hace falta
`APOLLO_API_KEY` server-side ni integración propia (con su coste en créditos): la vía natural
es Apollo/landing → lead en Holded, patrón que ya está en producción para las landings
("webhook n8n → crea lead en Holded CRM con tag `erp-medida`", página *Landing: ERP a medida*).

## Estado actual verificado

### Lo que existe y se reutiliza

- **Patrón de sincronización con Holded**: `syncAll()` (`src/lib/sync.ts:1424`), con
  `syncHoldedCompany`, `syncProformas`, `syncJournalEntries`, `syncEmployeesAndSalaryRecords`;
  cron diario en `vercel.json` (`/api/sync` 06:00). Un `syncHoldedCrm()` encaja aquí sin
  arquitectura nueva.
- **Multi-entidad fiscal**: `Company` lleva su propia `holdedApiKey` — cada cuenta de Holded
  (SL / OU) es independiente, incluida su cuota de API.
- **Propuestas (contrato ERP ↔ apps de marca)** — escrito, nunca probado en vivo:
  `src/app/api/webhooks/proposals/*`, `src/app/api/webhooks/documenso/route.ts`,
  `src/lib/documenso.ts`, `proposals-brand.ts`, `budget-pricing.ts`; migración
  `20260812120000_add_budget_proposals_integration` aplicada.
- **Holded**: `getClientContacts()` (`src/lib/holded.ts:955`), `createContact()` (l.1027),
  `listServices()` (l.1084), `createDocument("proform", …)` (l.385).
- **Drag & drop**: `@dnd-kit/core`, `/sortable`, `/utilities` ya en `package.json`.
- **Previsiones ya al día**: ojo, la tabla de estado de
  `docs/plan-revision-reunion-2026-09-03.md` está desactualizada. E5 (rediseño de `/forecasts`),
  E6 (entidad legal), E7 (SL/OU separados), E8 (tooltips) y E10 ("Comprometido" = proformas
  activas, `src/lib/cashflow-data.ts:35-36`) se implementaron después, en `a501914` y `f8c2f8f`.
  De esa lista lo que sigue abierto y toca a este plan es E11 (propuestas → D2) y el hueco que
  dejó E12 en el sidebar.

### Lo que no existe

- El ERP **nunca llama a `api/crm/v1`**: `src/lib/holded.ts` solo usa `invoicing/v1`,
  `accounting/v1` y `v2` (l.7-12). Leads y funnels de Holded son invisibles para el ERP.
- Ningún modelo de cliente, lead, oportunidad o actividad en `prisma/schema.prisma`.
- Ninguna página bajo `/crm`.

### Huecos estructurales que hay que abrir

1. **El cliente no es una entidad.** Solo hay `holdedContactId` como string suelto en
   `Invoice` (schema l.275), `Supplier` (l.504), `Proforma` (l.696) y `Budget` (l.909).
2. **`Budget.projectId` es obligatorio** (`prisma/schema.prisma:892-893`, `onDelete: Restrict`)
   → no se puede presupuestar a un prospect. Afecta a `budgets/page.tsx` (usa `b.project.id` sin
   comprobar null), `budgets/actions.ts:17,40`, `budgets/budgets-table.tsx:13,231,288`,
   `src/lib/mcp/tools/budgets.ts:12,25` y `src/app/api/webhooks/proposals/route.ts:86,126`.
3. **El webhook de propuestas no sabe de CRM**: no acepta referencia al lead, así que una
   propuesta creada en una app de marca no puede colgarse del lead que la originó.
4. **`Proforma` no tiene `@@index([companyId, holdedContactId])`** — `Invoice` sí (l.325).
   Necesario para la ficha 360 sin denormalizar.

### Restricciones de la API de Holded (verificadas por el equipo, playbook 2026-05-19)

Esto condiciona el diseño y conviene tenerlo delante:

| Hecho | Consecuencia para el CRM |
|-------|--------------------------|
| **Leads es uno de los dos únicos recursos con `createdAt` + `updatedAt` + `updatedHash` fiables**, y expone `userId` = responsable asignado | El mejor recurso posible para sync incremental y para mapear propietario comercial |
| **No hay webhooks** en Holded (está en la wishlist del playbook, prioridad Alta) | Solo polling: el espejo se refresca en el cron, no en tiempo real |
| **Cuotas mensuales de API desde el 1/6/2026**, por plan y **por cuenta** (SL y OU independientes) | El sync debe ser incremental y con presupuesto de peticiones; no full sync gratuito |
| **La escritura tiene cobertura irregular** entre módulos (wishlist: "CRUD completo y simétrico al GET") y el MCP interno es **solo GET** | **`POST`/`PATCH` sobre `crm/v1/leads` está sin confirmar** → es la incógnita que decide si el kanban del ERP escribe o es de solo lectura (ver F3) |
| `GET /contacts` **ignora `page`/`limit`** y devuelve el catálogo completo | El proxy de contactos de las propuestas necesita caché con TTL |
| Errores silenciosos: filtro inválido → `200 []`; recurso inexistente → **400**, no 404; auth por cabecera `key:` | Validar en cliente, no confiar en el status; registrar `x-correlationid` |

## Arquitectura objetivo

```
Apollo.io / LinkedIn SN / landings          (prospección — §10 estrategia)
   │  alta del lead (manual BDR, o n8n como ya se hace en las landings)
   ▼
Holded CRM  ─ api/crm/v1 ─ leads + funnels          ← SISTEMA DE REGISTRO (D4)
   │  GET incremental por updatedAt/updatedHash, dentro del cron de /api/sync
   ▼
ERP: espejo CrmLead + CrmFunnel  ──►  /crm  (tablero, listados, ficha 360)
   │                                        + enriquecido propio del ERP:
   │                                          marca, owner, cuenta, proyecto,
   │                                          actividades, próximos pasos
   │  al preparar propuesta: alta del CONTACTO fiscal en Holded (D3)
   ▼
POST /api/webhooks/proposals/contacts → holdedContactId (writeback a CrmAccount)
   │
   │  la app de marca crea la propuesta            gigsonapps.com / latroupeapps.com
   ▼                                                        │ POST /api/webhooks/proposals
Budget + BudgetLine + PaymentTerm  ◄────────────────────────┘
   │  firma (Documenso — ver riesgo DocuSign vs Documenso)
   ▼
DOCUMENT_COMPLETED → proforma real en Holded → lead a etapa ganada
   │  syncProformas() nocturno (sin cambios)
   ▼
/proformas → factura → /invoices → /forecasts (pipeline ponderado, E10)
```

El tramo propuesta → firma → proforma **ya está escrito**. Lo que añade este plan es el espejo
del CRM por la izquierda, la ficha 360, las actividades, y los dos enganches con las apps de
marca.

## Modelo de datos

Prefijo `Crm` porque `Account` ya existe (NextAuth, schema l.26) y `Company` significa *entidad
fiscal propia*, no cliente. Regla de espejo: **las columnas que Holded posee son de solo
lectura en el ERP**; lo que el ERP añade vive en columnas propias y nunca se sobrescribe en el
sync.

```prisma
/// Embudo comercial espejado de Holded (api/crm/v1/funnels). Las etapas las define
/// Holded — el ERP no inventa un enum propio.
model CrmFunnel {
  id             String  @id @default(cuid())
  companyId      String
  company        Company @relation(fields: [companyId], references: [id], onDelete: Cascade)
  holdedFunnelId String
  name           String
  stages         Json    // [{ id, name, order }] tal cual viene de Holded
  lastSyncedAt   DateTime?
  leads          CrmLead[]

  @@unique([companyId, holdedFunnelId])
  @@map("crm_funnels")
}

/// Lead/oportunidad espejado de Holded (api/crm/v1/leads). Holded los llama
/// "Leads / oportunidades": es la misma entidad, así que el ERP NO crea un modelo
/// Opportunity aparte (evita dos pipelines).
model CrmLead {
  id           String  @id @default(cuid())
  companyId    String
  company      Company @relation(fields: [companyId], references: [id], onDelete: Cascade)
  holdedLeadId String

  // ── Campos que posee Holded (solo lectura en el ERP) ──────────────────────
  name          String
  contactName   String?
  email         String?
  phone         String?
  amount        Decimal?
  currency      String    @default("EUR")
  funnelId      String?
  funnel        CrmFunnel? @relation(fields: [funnelId], references: [id], onDelete: SetNull)
  stageId       String?
  stageName     String?
  holdedUserId  String?   // responsable asignado en Holded
  holdedCreatedAt DateTime?
  holdedUpdatedAt DateTime?
  updatedHash   String?   // para sync incremental sin releer todo
  lastSyncedAt  DateTime?

  // ── Enriquecido propio del ERP (Holded no lo tiene) ───────────────────────
  marca             String?  // MARCA_OPTIONS (src/lib/org.ts)
  ownerId           String?  // User del ERP, resuelto desde holdedUserId
  owner             User?    @relation(fields: [ownerId], references: [id], onDelete: SetNull)
  accountId         String?
  account           CrmAccount? @relation(fields: [accountId], references: [id], onDelete: SetNull)
  expectedCloseDate DateTime?
  probability       Int?     // % para el pipeline ponderado (F7)
  notes             String?
  projectId         String?  // se rellena al ganar
  project           JiraProject? @relation(fields: [projectId], references: [id], onDelete: SetNull)

  budgets      Budget[]
  activities   CrmActivity[]
  stageHistory CrmLeadStageEvent[]

  @@unique([companyId, holdedLeadId])
  @@index([stageId]) @@index([ownerId]) @@index([marca]) @@index([expectedCloseDate])
  @@map("crm_leads")
}

/// Historial de etapas. Holded no expone histórico (ver wishlist del playbook:
/// "endpoint /history" sigue siendo una petición pendiente), así que se deriva
/// de los diffs que detecta el sync. Sin esto no hay ciclo de venta medible.
model CrmLeadStageEvent {
  id          String   @id @default(cuid())
  leadId      String
  lead        CrmLead  @relation(fields: [leadId], references: [id], onDelete: Cascade)
  fromStageId String?
  fromStageName String?
  toStageId   String?
  toStageName String?
  detectedAt  DateTime @default(now())
  source      String   @default("SYNC") // "SYNC" | "ERP"

  @@index([leadId])
  @@map("crm_lead_stage_events")
}

enum CrmLifecycle { LEAD QUALIFIED CUSTOMER CHURNED DISQUALIFIED }

/// Cuenta de cliente canónica del ERP: la columna vertebral de la ficha 360.
/// No existe en Holded como tal (Holded tiene leads y contactos, no cuentas).
model CrmAccount {
  id        String  @id @default(cuid())
  name      String
  domain    String? @unique
  vatNumber String?
  lifecycle CrmLifecycle @default(LEAD)
  marca     String?
  ownerId   String?
  owner     User?   @relation(fields: [ownerId], references: [id], onDelete: SetNull)

  // Enlace fiscal: null hasta que se prepara la primera propuesta (D3)
  companyId       String?
  company         Company?  @relation(fields: [companyId], references: [id], onDelete: SetNull)
  holdedContactId String?
  holdedSyncedAt  DateTime?

  leads      CrmLead[]
  contacts   CrmContact[]
  activities CrmActivity[]

  @@unique([companyId, holdedContactId])
  @@index([lifecycle]) @@index([ownerId]) @@index([marca])
  @@map("crm_accounts")
}

model CrmContact {
  id        String     @id @default(cuid())
  accountId String
  account   CrmAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)
  name      String
  email     String?
  phone     String?
  title     String?
  linkedinUrl String?
  isPrimary Boolean @default(false)
  activities CrmActivity[]

  @@unique([accountId, email])
  @@index([accountId])
  @@map("crm_contacts")
}

enum CrmActivityType { NOTE CALL EMAIL MEETING TASK }

/// Actividades y próximos pasos. Enteramente del ERP: la API de Holded no expone
/// actividades de CRM.
model CrmActivity {
  id      String          @id @default(cuid())
  type    CrmActivityType
  subject String
  body    String?

  accountId String?
  contactId String?
  leadId    String?
  ownerId   String?

  dueDate     DateTime?
  completedAt DateTime?
  externalRef String?   // id de ReadAI (§7.1: discovery se graba con ReadAI), thread de Gmail…

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([accountId]) @@index([leadId]) @@index([ownerId, dueDate])
  @@map("crm_activities")
}
```

Cambios en modelos existentes:

- `Budget`: `crmLeadId String?` + relación; **`projectId` pasa a nullable**.
- `Proforma`: añadir `@@index([companyId, holdedContactId])`.
- `Company`: relaciones inversas (`crmFunnels`, `crmLeads`, `crmAccounts`).
- `User`: relaciones inversas (`crmLeads`, `crmAccounts`, `crmActivities`).
- No se toca `Invoice` ni el sync fiscal: la ficha 360 resuelve por
  `(companyId, holdedContactId)`, índice que `Invoice` ya tiene (l.325).

## Fases

### F0 — Cerrar los pendientes de propuestas v2 (1-2 j) · bloqueante del tramo final
Los 4 items de `docs/proposals-plan-v2.md` → "Pendiente de ejecutar". Con D2 es prioritario:
el ERP es **solo** API para las apps de marca, así que si el contrato no está probado, el CRM
desemboca en nada.
1. Variables en Vercel (Production y Preview): `DOCUMENSO_API_KEY`,
   `DOCUMENSO_WEBHOOK_SECRET`, `DOCUMENSO_BASE_URL` (opcional),
   `GIGSONAPPS_PROPOSALS_SECRET`, `LTTOOLS_PROPOSALS_SECRET`.
2. E2E con curl simulando una app de marca: crear propuesta → firmar → comprobar proforma real
   en Holded y `PaymentTerm.proformaId`.
3. Confirmar la cabecera real de firma del webhook de Documenso (`src/lib/documenso.ts:140`
   asume `x-documenso-signature` + HMAC-SHA256, sin confirmar).
4. Confirmar el esquema de creación de documentos contra una cuenta real (API pública de
   Documenso migrando al modelo "envelope").

### F1 — Cliente de CRM de Holded + espejo (3-4 j)
- `src/lib/holded.ts`: añadir base `api/crm/v1` y métodos `getLeads()`, `getFunnels()`
  (cabecera `key:`, 400 en lugar de 404, `x-correlationid` en logs — playbook §3, §8).
  Confirmar antes contra `developers.holded.com/reference` **si existe escritura de leads**;
  el resultado condiciona F3.
- `prisma/schema.prisma` + migración `20260917xxxxxx_add_crm_module`.
- `syncHoldedCrm(companyId)` en `src/lib/sync.ts`, enganchado a `syncAll()` y al cron de 06:00:
  incremental por `updatedAt`/`updatedHash`, con presupuesto de peticiones y registro en
  `SyncLog` (nuevo valor de `SyncSource`). Detecta cambios de etapa y escribe
  `CrmLeadStageEvent`.
- **`Budget.projectId` a nullable** + arreglar los call sites del hueco 2 (commit aparte).
- Backfill `scripts/backfill-crm-accounts.ts`: `CrmAccount` con `lifecycle: CUSTOMER` a partir
  de `(companyId, holdedContactId)` ya presentes en `Invoice`/`Proforma`/`Budget`, nombre desde
  `counterparty`/`clientName`. Idempotente y con `--dry-run` por defecto, como el resto de
  scripts del repo.

### F2 — `/crm`: tablero y listados sobre el espejo (3-4 j)
- `/crm/leads`: tablero por etapas del funnel de Holded (`@dnd-kit` ya instalado) y listado con
  filtros por marca, responsable, etapa y fecha de cierre estimada.
- `/crm/leads/[id]`: detalle con actividades, propuestas asociadas y enlace profundo al lead en
  Holded.
- Enriquecido editable en el ERP (marca, owner, cuenta, fecha de cierre, probabilidad) sin
  tocar los campos que posee Holded.
- Rellenar la subsección CRM del sidebar (`src/components/sidebar.tsx:55`) y actualizar el
  comentario de l.43-44 que hoy dice que está vacía a propósito.

### F3 — Escritura hacia Holded, si la API lo permite (1-3 j · depende de F1)
Decisión gobernada por lo que se confirme en F1:
- **Si `crm/v1/leads` acepta escritura**: arrastrar en el tablero cambia la etapa en Holded
  (idempotente, con relectura posterior para confirmar y `source: "ERP"` en el historial).
- **Si es solo lectura**: el tablero queda de consulta, el cambio de etapa se hace en Holded
  (enlace profundo ya previsto en F2) y se documenta la limitación. Nada de simular en el ERP
  un estado que Holded no tiene: sería un segundo pipeline divergente.

### F4 — Ficha de cliente 360 (2 j)
- `/crm/cuentas` y `/crm/cuentas/[id]`: contactos, leads, presupuestos, proformas, facturas y
  proyectos de la cuenta, resolviendo por `(companyId, holdedContactId)` más el índice nuevo en
  `Proforma`.

### F5 — Actividades y próximos pasos (2-3 j)
- `/crm/actividades`: agenda de tareas pendientes por responsable.
- Notas/llamadas/reuniones desde la ficha de cuenta y desde el lead.
- Recordatorio diario de próximos pasos vencidos con el patrón de `/api/notify/proformas`
  (nuevo cron en `vercel.json`). Sirve directamente a la regla no negociable de la estrategia
  (§7.2): "ningún lead sin respuesta en más de 24 horas".
- Opcional: enganchar grabaciones de ReadAI por `externalRef` (§7.1 ya lo fija como
  herramienta de discovery).

### F6 — Enganche CRM ↔ apps de marca (2 j)
Amplía el contrato de `docs/proposals-plan-v2.md`. Los consumidores todavía no existen
(`gigsonapps` sin crear, módulo de `lt-tools` pendiente), así que cambiarlo ahora no cuesta:
- `GET /api/webhooks/proposals/contacts`: además de contactos de Holded, devolver leads
  espejados sin contacto fiscal, marcados con su origen, para poder elegir un lead que aún no
  está en `invoicing/v1/contacts`. Con caché TTL, porque `/contacts` no pagina y devuelve el
  catálogo entero (playbook §6).
- `POST /api/webhooks/proposals/contacts`: aceptar `crmAccountId`/`crmLeadId` y **escribir de
  vuelta** `holdedContactId` + `holdedSyncedAt` + `lifecycle: QUALIFIED` (D3).
- `POST /api/webhooks/proposals`: aceptar `crmLeadId`, enlazar `Budget.crmLeadId` y hacer
  `projectId` **opcional** (hoy obligatorio, `route.ts:86`).
- `POST /api/webhooks/documenso`: en `DOCUMENT_COMPLETED`, registrar el cierre en el lead
  (y mover etapa en Holded si F3 concluyó que hay escritura).
- Actualizar `docs/proposals-plan-v2.md` con el contrato resultante.

### F7 — KPIs comerciales y enlace con previsiones (2-3 j)
- Los KPIs no hay que inventarlos: están en §8 de la estrategia. Implementar en `/crm` las
  conversiones contacto→respuesta, respuesta→discovery, discovery→propuesta, propuesta→cierre,
  ticket medio y ciclo de venta (desde `CrmLeadStageEvent`), por marca.
- **E10 de la reunión**: el CRM aporta la capa que faltaba por delante. Comprometido =
  proformas activas (ya existe); pipeline ponderado (`amount × probability`) = capa nueva
  anterior, como entrada opcional del escenario en `/forecasts`.
- **Horizonte temporal** (decidirlo antes de sumar pipeline, no después):
  `resolveDateRange` (`src/lib/cashflow-data.ts:78-97`) cierra todos los rangos "last_X_months"
  en fin del mes en curso (`lte: endOfCurrentMonth`), así que un lead con `expectedCloseDate`
  posterior queda **fuera** de cualquier filtro de periodo actual. El pipeline necesita su
  propio horizonte hacia adelante (p.ej. "próximos N meses"), no el rango de tesorería.

**Estimación total: ~16-21 jornadas.** F0 y F1 son prerrequisito del resto; F3 depende de lo
que se confirme de la API en F1; F4, F5 y F6 son independientes entre sí.

## Verificación

- Por fase: `pnpm typecheck && pnpm lint && pnpm test` (lo mismo que corre CI en
  `.github/workflows/deploy.yml` y `deploy-staging.yml`, más `pnpm next build`).
- Migraciones: `pnpm prisma migrate dev` en local y revisión del SQL a mano; la rama `staging`
  tiene base propia (`refresh-staging-db.yml`) — probar ahí el backfill antes de producción.
- Tests de dominio nuevos: sync incremental de leads (alta, cambio de etapa, borrado), mapeo
  `holdedUserId` → `User`, y resolución de la ficha 360 por `(companyId, holdedContactId)`.
- **Consumo de API antes de desplegar el sync**: estimar peticiones/mes por cuenta (SL y OU
  tienen cuotas independientes) siguiendo el checklist del playbook §10. El sync del CRM se
  suma al que ya existe.
- F0, F3 y F6 se verifican con curl contra Preview: son contratos con sistemas externos.

## Riesgos y decisiones abiertas

1. **Escritura en `crm/v1/leads` sin confirmar** — es el riesgo que más cambia el resultado
   (kanban editable vs. de consulta). Confirmar en F1 antes de prometer tablero editable.
2. **Sin webhooks + cuotas mensuales**: el espejo llega con el retraso del cron y cada
   refresco cuesta cuota. No prometer tiempo real.
3. **DocuSign vs Documenso**: la estrategia (§7.1, "Cierre") dice **Holded / DocuSign**,
   mientras el código del ERP implementa **Documenso** (`src/lib/documenso.ts`). Hay que
   zanjar cuál es la herramienta de firma antes de F0, o se está probando un contrato que la
   estrategia no reconoce.
4. **Las propuestas hoy son "Figma → PDF"** (§7.1). Las apps de marca (D2) tienen que
   sustituir ese flujo manual; hasta entonces el tramo propuesta→firma del ERP no tiene
   productor real.
5. **`Budget.projectId` nullable** toca `/budgets`, sus server actions, la tabla y la tool MCP:
   transversal aunque pequeño, mejor aislado en su propio commit.
6. **Sin roles**: la auth es allowlist SSO (`SsoAllowedEmail`) sin RBAC, así que el pipeline
   comercial será visible a cualquier usuario con acceso al ERP. Si eso no vale, hace falta una
   fase previa de roles.
7. **Doble edición**: si el ERP escribe etapas (F3) y alguien las mueve en Holded a la vez, hay
   conflicto. La disciplina de espejo (Holded manda en sus campos) lo limita, pero conviene
   decidir qué gana si el sync encuentra divergencia.
8. **PII**: el ERP pasará a espejar datos de contacto de personas que aún no son clientes.
   Menor que en un CRM propio (el dato vive en Holded), pero hay que revisar base legal y
   retención del espejo.
9. **`marca` sigue siendo un string** (`MARCA_OPTIONS`), no un enum, y `CrmLead.marca` hereda
   esa debilidad. No se arregla aquí para no ampliar el alcance.
