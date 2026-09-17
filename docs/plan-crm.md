# Plan: CRM en erp-awesomely

> Estado: propuesta para revisión. Decisiones de alcance tomadas el 2026-09-17 (ver
> "Decisiones de alcance").
> Relacionados: `docs/proposals-plan-v2.md` (contrato de propuestas, implementado a medias),
> `docs/plan-revision-reunion-2026-09-03.md` (items E10, E11, E12).

## Contexto

Desde la reunión del 2026-09-03 el sidebar reserva una subsección **"CRM" vacía a propósito**
(`src/components/sidebar.tsx:55`, comentario en l.43-44). Nunca se desarrolló nada detrás: no
hay modelo de cliente, ni oportunidades, ni actividades. El ciclo comercial hoy empieza
directamente en un presupuesto (`/budgets`) que **exige un proyecto de Jira ya existente**, es
decir, solo se puede presupuestar a quien ya es cliente y tiene proyecto abierto. Todo lo
anterior al proyecto (prospección, cualificación, seguimiento) vive fuera del ERP.

Este plan cubre ese hueco: de lead a cliente facturado, dentro del ERP, enganchando con las
piezas que ya existen (Holded, Documenso, propuestas de marca, previsiones).

## Decisiones de alcance

| # | Decisión | Implicación |
|---|----------|-------------|
| D1 | **CRM completo de una tanda**: cuentas + contactos + pipeline + actividades | Se planifica por fases pero el alcance es el CRM entero, no un MVP de ficha de cliente |
| D2 | **El generador de propuestas vive en las apps de marca** (`gigsonapps.com` / `latroupeapps.com`) | El ERP **no** construye configurador de propuestas. E11 ("rehacer Presupuestos como generador") se resuelve así: `/budgets` queda como vista interna de lectura/enlace; el ERP expone API + Holded + firma, como ya define `docs/proposals-plan-v2.md` |
| D3 | **El lead nace en Apollo**; el contacto en Holded se crea **solo al preparar la propuesta** | `CrmAccount.holdedContactId` es nullable y se rellena tarde. Ninguna cuenta de CRM necesita existir en Holded para entrar en el pipeline. `vatNumber` tampoco es obligatorio hasta ese momento |

Consecuencia directa de D3: el pipeline comercial completo (LEAD → QUALIFIED → PROPOSAL) ocurre
sin tocar Holded. Holded entra en escena cuando hay propuesta que firmar, y factura cuando se
firma.

## Estado actual verificado

### Lo que existe y se reutiliza

- **Propuestas (contrato ERP ↔ apps de marca)** — implementado, nunca probado en vivo:
  `src/app/api/webhooks/proposals/route.ts`, `.../[budgetId]/status/route.ts`,
  `.../contacts/route.ts`, `src/app/api/webhooks/documenso/route.ts`,
  `src/lib/documenso.ts` (148 l.), `src/lib/proposals-brand.ts`, `src/lib/budget-pricing.ts`.
  Migración `prisma/migrations/20260812120000_add_budget_proposals_integration/` ya aplicada.
- **Holded**: `HoldedClient.getClientContacts()` (`src/lib/holded.ts:955`), `createContact()`
  (l.1027), `listServices()` (l.1084), `createDocument("proform", …)` (l.385).
- **Marca / entidad fiscal**: `MARCA_OPTIONS` (`src/lib/org.ts:4-9`), `Company` = entidad fiscal
  propia (determina la API key de Holded), `BRAND_TO_MARCA` en `proposals-brand.ts`.
- **Auth de endpoints**: `authenticateRequest()` (`src/lib/api-auth.ts`, sesión o `x-api-key`);
  `/api/webhooks/*` ya bypasea la sesión (`src/proxy.ts:27`); secretos por plataforma en
  `expectedSecretFor()`.
- **Drag & drop**: `@dnd-kit/core`, `/sortable`, `/utilities` ya están en `package.json`.
- **Crons**: `vercel.json` (`/api/sync` 06:00, `/api/notify/proformas` 07:00) — patrón a seguir
  para recordatorios de próximos pasos.
- **Previsiones ya al día**: ojo, la tabla de estado de
  `docs/plan-revision-reunion-2026-09-03.md` está desactualizada. E5 (rediseño de `/forecasts`),
  E6 (entidad legal), E7 (SL/OU separados), E8 (tooltips) y E10 ("Comprometido" = proformas
  activas, `src/lib/cashflow-data.ts:35-36`) se implementaron después, en `a501914` y `f8c2f8f`.
  De esa lista lo que sigue abierto y toca a este plan es E11 (propuestas → D2) y el hueco que
  dejó E12 en el sidebar.

### Lo que no existe

- Ningún modelo de cliente, contacto, lead, oportunidad o actividad en `prisma/schema.prisma`
  (1176 líneas, ~45 modelos).
- Ninguna página bajo `/crm`. La subsección del sidebar no enlaza a nada.
- Ninguna integración con Apollo en el repo (solo aparece como concepto de gasto en
  `prisma/seed.ts:46`, tag `OPEX:Ventas:Herramientas`).
- Ningún embudo de venta: `BudgetStatus` es DRAFT/ACTIVE/COMPLETED/ARCHIVED (ciclo de vida de un
  presupuesto de proyecto, no etapas comerciales: no hay SENT/WON/LOST).

### Huecos estructurales que hay que abrir

1. **El cliente no es una entidad.** Solo hay `holdedContactId` como string suelto en
   `Invoice` (schema l.275), `Supplier` (l.504), `Proforma` (l.696) y `Budget` (l.909). No hay
   forma de responder "todo lo de este cliente" sin cruzar cuatro tablas por un string.
2. **`Budget.projectId` es obligatorio** (`prisma/schema.prisma:892-893`, `onDelete: Restrict`) →
   no se puede presupuestar a un prospect. Es el bloqueo central de D3. Afecta a:
   `src/app/(dashboard)/budgets/page.tsx` (usa `b.project.id` sin comprobar null),
   `budgets/actions.ts:17,40`, `budgets/budgets-table.tsx:13,231,288`,
   `src/lib/mcp/tools/budgets.ts:12,25` y `src/app/api/webhooks/proposals/route.ts:86,126`
   (`projectId es obligatorio`).
3. **El webhook de propuestas no sabe de CRM**: no acepta `crmAccountId` ni `opportunityId`, así
   que una propuesta creada desde una app de marca no puede volver a colgarse de la oportunidad
   que la originó.
4. **`Proforma` no tiene índice por contacto** (`@@index([companyId, holdedContactId])`): `Invoice`
   sí lo tiene (l.325). Necesario para la ficha 360 sin denormalizar.

## Arquitectura objetivo

```
Apollo (prospección)
   │  import selectivo · dedupe por dominio · enriquecido bajo tope de créditos
   ▼
CrmAccount(LEAD) + CrmContact ──► Opportunity(LEAD → QUALIFIED)        [ERP, /crm]
   │                                        │
   │  al preparar propuesta                 │ la app de marca busca la cuenta
   │  (alta diferida en Holded)             │ (la búsqueda incluye leads sin Holded)
   ▼                                        ▼
POST /api/webhooks/proposals/contacts   gigsonapps.com / latroupeapps.com
   → holdedContactId (writeback)            │ POST /api/webhooks/proposals
                                            ▼
                          Budget + BudgetLine + PaymentTerm
                          Opportunity → PROPOSAL   (documensoStatus: SENT/VIEWED)
                                            │ firma en Documenso
                                            ▼
                          DOCUMENT_COMPLETED → proforma real en Holded
                          Opportunity → WON  (+ proyecto, si procede)
                                            │ syncProformas() nocturno (sin cambios)
                                            ▼
                          /proformas → factura → /invoices → /forecasts
```

El tramo de la derecha (propuesta → firma → proforma) **ya está escrito**; lo que este plan añade
es todo lo que hay a la izquierda, más los dos enganches (búsqueda de cuentas con leads, y
`opportunityId` de vuelta en el webhook).

## Modelo de datos

Nombres con prefijo `Crm` donde hay colisión: `Account` ya existe (NextAuth, schema l.26) y
`Company` significa *entidad fiscal propia*, no cliente.

```prisma
enum CrmLifecycle { LEAD QUALIFIED CUSTOMER CHURNED DISQUALIFIED }
enum CrmSource    { APOLLO MANUAL REFERRAL INBOUND EVENT }

/// Empresa cliente o prospect. Existe antes de que exista en Holded (D3).
model CrmAccount {
  id       String  @id @default(cuid())
  name     String
  domain   String? @unique        // clave de dedupe con Apollo
  vatNumber String?               // se exige solo al dar de alta en Holded
  country  String?
  city     String?
  industry String?
  sizeRange String?

  lifecycle CrmLifecycle @default(LEAD)
  source    CrmSource    @default(APOLLO)
  marca     String?      // MARCA_OPTIONS (src/lib/org.ts)
  ownerId   String?      // User responsable comercial
  owner     User?        @relation(fields: [ownerId], references: [id], onDelete: SetNull)

  apolloOrgId String? @unique

  // Enlace con Holded: null hasta que se prepara la primera propuesta (D3)
  companyId       String?   // entidad fiscal que facturará (qué API key de Holded)
  company         Company?  @relation(fields: [companyId], references: [id], onDelete: SetNull)
  holdedContactId String?
  holdedSyncedAt  DateTime?

  contacts      CrmContact[]
  opportunities Opportunity[]
  activities    CrmActivity[]

  @@unique([companyId, holdedContactId])
  @@index([lifecycle]) @@index([ownerId]) @@index([marca])
  @@map("crm_accounts")
}

/// Persona de contacto.
model CrmContact {
  id        String     @id @default(cuid())
  accountId String
  account   CrmAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)
  name      String
  email     String?
  phone     String?
  title     String?
  linkedinUrl String?
  apolloPersonId String? @unique
  isPrimary Boolean @default(false)
  activities CrmActivity[]

  @@unique([accountId, email])
  @@index([accountId])
  @@map("crm_contacts")
}

enum OpportunityStage { LEAD QUALIFIED PROPOSAL NEGOTIATION WON LOST }

model Opportunity {
  id        String     @id @default(cuid())
  accountId String
  account   CrmAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)
  name      String
  stage     OpportunityStage @default(LEAD)
  amount    Decimal?
  currency  String   @default("EUR")
  probability Int?             // % ; default por etapa (ver abajo)
  expectedCloseDate DateTime?
  closedAt   DateTime?
  lostReason String?
  source     CrmSource @default(APOLLO)
  marca      String?
  companyId  String?
  ownerId    String?

  /// Null hasta ganar: el proyecto se crea al cerrar (cierra el hueco de Budget.projectId)
  projectId String?
  project   JiraProject? @relation(fields: [projectId], references: [id], onDelete: SetNull)

  budgets      Budget[]
  activities   CrmActivity[]
  stageHistory OpportunityStageEvent[]

  @@index([stage]) @@index([accountId]) @@index([ownerId]) @@index([expectedCloseDate])
  @@map("opportunities")
}

/// Historial de etapas — necesario para ciclo de venta y conversión por etapa (F7).
model OpportunityStageEvent {
  id            String   @id @default(cuid())
  opportunityId String
  opportunity   Opportunity @relation(fields: [opportunityId], references: [id], onDelete: Cascade)
  fromStage     OpportunityStage?
  toStage       OpportunityStage
  changedById   String?
  createdAt     DateTime @default(now())

  @@index([opportunityId])
  @@map("opportunity_stage_events")
}

enum CrmActivityType { NOTE CALL EMAIL MEETING TASK }

model CrmActivity {
  id      String          @id @default(cuid())
  type    CrmActivityType
  subject String
  body    String?

  accountId     String?
  contactId     String?
  opportunityId String?
  ownerId       String?

  dueDate     DateTime?   // próximo paso / tarea
  completedAt DateTime?
  externalRef String?     // id de Read.ai, thread de Gmail… para trazabilidad

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([accountId]) @@index([opportunityId]) @@index([ownerId, dueDate])
  @@map("crm_activities")
}
```

Cambios en modelos existentes:

- `Budget`: `opportunityId String?` + relación; **`projectId` pasa a nullable**.
- `Proforma`: añadir `@@index([companyId, holdedContactId])`.
- `User`: relaciones inversas (`crmAccounts`, `opportunities`, `activities`).
- No se toca `Invoice` ni el sync fiscal: la ficha 360 resuelve por
  `(companyId, holdedContactId)`, índice que `Invoice` ya tiene (l.325).

Probabilidad por defecto: LEAD 10 · QUALIFIED 25 · PROPOSAL 50 · NEGOTIATION 75 · WON 100 ·
LOST 0. Editable por oportunidad (el default solo se aplica al cambiar de etapa si el usuario no
lo ha tocado).

## Fases

### F0 — Cerrar los pendientes de propuestas v2 (1-2 j) · bloqueante del tramo final
Los 4 items de `docs/proposals-plan-v2.md` → "Pendiente de ejecutar". Con D2 esto pasa a ser
prioritario, porque el ERP es **solo** API para las apps de marca: si el contrato no está
probado, el CRM desemboca en nada.
1. Variables en Vercel (Production y Preview): `DOCUMENSO_API_KEY`,
   `DOCUMENSO_WEBHOOK_SECRET`, `DOCUMENSO_BASE_URL` (opcional),
   `GIGSONAPPS_PROPOSALS_SECRET`, `LTTOOLS_PROPOSALS_SECRET`.
2. E2E con curl simulando una app de marca (no hace falta que exista `gigsonapps`):
   crear propuesta → firmar → comprobar proforma real en Holded y `PaymentTerm.proformaId`.
3. Confirmar la cabecera real de firma del webhook de Documenso (`src/lib/documenso.ts:140`
   asume `x-documenso-signature` + HMAC-SHA256, sin confirmar).
4. Confirmar el esquema de creación de documentos contra una cuenta real (la API pública de
   Documenso está migrando al modelo "envelope").

### F1 — Modelo de datos y migración (2-3 j)
- `prisma/schema.prisma` con los modelos de arriba.
- Migración `prisma/migrations/20260917xxxxxx_add_crm_module/`.
- **Migración de `Budget.projectId` a nullable** + arreglar los call sites del hueco 2:
  `budgets/page.tsx`, `budgets/actions.ts`, `budgets/budgets-table.tsx`,
  `src/lib/mcp/tools/budgets.ts`, `src/app/api/webhooks/proposals/route.ts`.
- Backfill (`scripts/backfill-crm-accounts.ts`): crear `CrmAccount` con
  `lifecycle: CUSTOMER` a partir de los contactos de cliente ya presentes en `Invoice`/
  `Proforma`/`Budget` (agrupando por `(companyId, holdedContactId)`, nombre desde
  `counterparty`/`clientName`), y `source: MANUAL`. Idempotente, con `--dry-run` por defecto
  igual que el resto de scripts del repo.

### F2 — Leads desde Apollo (2-3 j)
- `src/lib/apollo.ts` con el mismo patrón que `holded.ts` (clase + errores tipados).
  **Nota**: el conector MCP de Apollo de esta sesión es del lado de Claude, no sirve desde
  Vercel; el ERP necesita su propia `APOLLO_API_KEY` server-side. El endpoint y la forma exacta
  de la API (`api.apollo.io`, búsqueda de personas/organizaciones, cabecera de auth) hay que
  **confirmarlos contra la documentación oficial** antes de dar la fase por cerrada — mismo
  criterio que se aplicó con Documenso.
- `POST /api/crm/leads/import` (auth con `authenticateRequest`): recibe una selección de
  prospects, deduplica por `domain` y luego por `apolloOrgId`, crea `CrmAccount(LEAD)` +
  `CrmContact`.
- **Créditos**: Apollo cobra por enriquecido. Deduplicar *antes* de enriquecer, tope
  configurable por import y nunca enriquecer desde un cron sin límite. Registrar el consumo
  en `SyncLog` (`SyncSource` nuevo valor `APOLLO`).
- `/crm/leads`: cola de cualificación (aceptar → QUALIFIED + crea oportunidad; descartar →
  DISQUALIFIED con motivo).

### F3 — Pipeline de oportunidades (3-4 j)
- `/crm/oportunidades`: kanban por etapa con `@dnd-kit` (ya instalado), arrastrar cambia etapa y
  escribe `OpportunityStageEvent`. Filtros por marca, owner y fecha de cierre.
- `/crm/oportunidades/[id]`: detalle con contactos, actividades, propuestas asociadas
  (`Budget[]`) y su `documensoStatus`.
- Server actions para crear/editar/cambiar etapa, con `AuditLog` (el patrón ya existe).
- Al pasar a WON: crear proyecto si no existe y rellenar `Opportunity.projectId`.

### F4 — Ficha de cliente 360 (2 j)
- `/crm/cuentas` (listado con filtros lifecycle/marca/owner) y `/crm/cuentas/[id]`.
- La ficha agrega: contactos, oportunidades, presupuestos, proformas, facturas y proyectos,
  resolviendo por `(companyId, holdedContactId)` — más el índice nuevo en `Proforma`.
- Rellenar la subsección CRM del sidebar (`src/components/sidebar.tsx:55`) y actualizar el
  comentario de l.43-44, que hoy dice que está vacía a propósito.

### F5 — Actividades y próximos pasos (2-3 j)
- `/crm/actividades`: agenda de tareas con `dueDate` pendientes por owner.
- Notas/llamadas/reuniones desde la ficha de cuenta y desde la oportunidad.
- Recordatorio diario de próximos pasos vencidos siguiendo el patrón de
  `/api/notify/proformas` (nuevo cron en `vercel.json`).
- Opcional (fuera de ruta crítica): enganchar transcripciones de Read.ai por `externalRef`.

### F6 — Enganche CRM ↔ apps de marca (2 j)
Amplía el contrato de `docs/proposals-plan-v2.md`. Como los consumidores todavía no existen
(`gigsonapps` sin crear, módulo de `lt-tools` pendiente), es el momento de cambiarlo sin coste:
- `GET /api/webhooks/proposals/contacts`: además de los contactos de Holded, devolver
  `CrmAccount` sin `holdedContactId` (leads), marcados con un flag de origen, para que la app de
  marca pueda elegir un lead que aún no está en Holded.
- `POST /api/webhooks/proposals/contacts`: aceptar `crmAccountId` opcional y **escribir de vuelta**
  `holdedContactId` + `holdedSyncedAt` + `lifecycle: QUALIFIED` en esa cuenta (D3).
- `POST /api/webhooks/proposals`: aceptar `opportunityId` (o `crmAccountId`), enlazar
  `Budget.opportunityId`, mover la oportunidad a PROPOSAL y hacer `projectId` **opcional** en el
  payload (hoy obligatorio, `route.ts:86`).
- `POST /api/webhooks/documenso`: en `DOCUMENT_COMPLETED`, mover la oportunidad a WON y
  registrar el `OpportunityStageEvent`.
- Actualizar `docs/proposals-plan-v2.md` con el contrato resultante.

### F7 — KPIs comerciales y enlace con previsiones (2-3 j)
- KPIs en `/crm`: pipeline ponderado (`amount × probability`), conversión por etapa, ciclo medio
  de venta (desde `OpportunityStageEvent`), win rate por marca, valor medio de operación.
- **E10 de la reunión** (estimado / comprometido / real): el CRM aporta la capa que faltaba por
  delante. Comprometido = proformas firmadas (ya existe); pipeline ponderado = capa nueva
  anterior, como entrada opcional del escenario en `/forecasts`.
- **Horizonte temporal** (decidirlo antes de sumar pipeline, no después):
  `resolveDateRange` (`src/lib/cashflow-data.ts:78-97`) cierra todos los rangos "last_X_months"
  en fin del mes en curso (`lte: endOfCurrentMonth`), así que una oportunidad con
  `expectedCloseDate` posterior queda **fuera** de cualquier filtro de periodo actual. El
  pipeline necesita su propio horizonte hacia adelante (p.ej. "próximos N meses"), no el rango
  de tesorería.

**Estimación total: ~16-22 jornadas**, entregable por fases (F0 y F1 son prerrequisito del
resto; F2→F5 son independientes entre sí una vez está F1).

## Verificación

- Por fase: `pnpm typecheck && pnpm lint && pnpm test` (es exactamente lo que corre CI en
  `.github/workflows/deploy.yml` y `deploy-staging.yml`, más `pnpm next build`).
- Migraciones: `pnpm prisma migrate dev` en local y revisión del SQL a mano antes de mergear;
  la rama `staging` tiene su propia base (`refresh-staging-db.yml`) — probar el backfill ahí
  antes de producción.
- Tests de dominio nuevos en `src/lib/`: dedupe de leads (dominio/`apolloOrgId`), probabilidad
  por etapa, y resolución de la ficha 360 por `(companyId, holdedContactId)`. Evals de dominio
  en `evals/domain/` si el criterio de cualificación se vuelve heurístico.
- F0 y F6 se verifican con curl contra Preview, no con tests unitarios: son contratos con
  sistemas externos.

## Riesgos y decisiones abiertas

1. **`Budget.projectId` nullable** toca `/budgets`, sus server actions, la tabla y la tool MCP.
   Es un cambio pequeño pero transversal: conviene aislarlo en su propio commit dentro de F1.
2. **Apollo**: forma real de la API y coste en créditos sin confirmar (ver F2). Riesgo de gastar
   créditos en enriquecidos duplicados si el dedupe va después del enriquecido.
3. **Sin roles**: la auth es allowlist SSO (`SsoAllowedEmail`) sin RBAC, así que el pipeline
   comercial será visible a cualquier usuario con acceso al ERP. Si eso no vale, hace falta una
   fase previa de roles — decisión pendiente.
4. **Duplicidad de fuente de verdad**: si el equipo sigue trabajando el pipeline dentro de Apollo
   (tiene deals y secuencias propias), habrá dos pipelines. Decidir si Apollo queda solo como
   fuente de prospección (es lo que asume este plan) o si hay que sincronizar estados.
5. **PII de prospects**: el CRM guardará emails y teléfonos de personas que no son clientes.
   Revisar base legal y retención antes de F2 (hoy el ERP solo guarda datos de contacto de
   clientes y proveedores ya contratados).
6. **`marca` sigue siendo un string** (`MARCA_OPTIONS`), no un enum, y `CrmAccount.marca` hereda
   esa debilidad. No se arregla aquí para no ampliar el alcance, pero queda anotado.
