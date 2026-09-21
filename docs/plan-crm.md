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
> - Google Slides · *"Plan Estratégico & Activación"* de **Odoo Partner** (plantilla de
>   incorporación de Odoo Enterprise como línea de negocio de Gigson) — embudo, objetivos de año
>   1 y las 8 métricas de gobernanza. Ver "Impacto del plan de activación de Odoo".
>
> Relacionados en el repo: `docs/api-erp.md` (contrato de la API y delta de endpoints de este
> módulo), `docs/proposals-plan-v2.md` (contrato de propuestas, implementado a medias),
> `docs/plan-revision-reunion-2026-09-03.md` (E10, E11, E12).

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
| D4 | **El ERP es el sistema de registro del pipeline comercial. Holded lo es de los contactos fiscales y la facturación** | **Revisada el 2026-09-21** (antes decía lo contrario: espejar Holded CRM). En Holded, contacto (`invoicing/v1/contacts`) y lead (`crm/v1/leads`) son objetos independientes: tener contacto no implica tener lead, y **no consta ningún lead en el CRM de Holded**. Las 22 oportunidades del inventario salieron del buzón; el resto del pipeline vive en hojas de Drive y, para Odoo, en su CRM de partner. Mantener el espejo era construirlo sobre una habitación vacía |
| D5 | **La firma se queda en Documenso** (lo ya implementado); se actualiza la estrategia, no el código | Decisión del 2026-09-17. Cierra la contradicción con §7.1, que decía "Holded / DocuSign" |
| D6 | **Alcance: solo `erp-awesomely`** | Decisión del 2026-09-18. `lt-tools` y `holded-mcp` quedan para sesión propia (ver final del documento) |
| D7 | **La carga inicial entra directamente en el ERP** | Decisión del 2026-09-20. Con la D4 revisada deja de ser una excepción: entra en el sistema de registro, sin reglas especiales de reconciliación |
| D8 | **Las sociedades relacionadas son cuentas separadas, unidas por una relación tipada** | Decisión del 2026-09-20. Sustituye a la propuesta del artifact ("una cuenta con dos sociedades"): los casos reales son de tres tipos distintos (hermanas, holding→filial, proveedor-de) y no caben en una jerarquía única |
| D9 | **Una oportunidad por frente de trabajo**, también dentro de un retainer | Decisión del 2026-09-20. Obliga a distinguir negocio nuevo de ampliación para que las métricas no se inflen (`dealType`) |
| D10 | **En el CRM entran clientes, leads y partners/prescriptores; no proveedores** | Decisión del 2026-09-20. El ERP ya tiene el modelo `Supplier`; duplicarlo daría dos fuentes de verdad para el mismo tercero |
| D11 | **Las etapas del embudo son un modelo propio del ERP, configurable por marca y línea** | Consecuencia de la D4 revisada. Cada línea tiene su embudo: Odoo (Leads → **Demo** → Propuesta → Ganado), Gigson integraciones (contacto → BANT → discovery → propuesta → negociación → cierre) y LaTroupe. Se editan en `/settings`, sin depender de Holded |

### Reconciliación de D3 con la estrategia (no hay conflicto)

Parecía que D3 ("el lead nace en Apollo") contradecía el funnel ("registrar en Holded CRM"),
pero son **dos objetos distintos de Holded**:

- **Lead** = `api/crm/v1/leads` — objeto de CRM, sin datos fiscales. Aquí entra el lead desde el
  primer momento, como dice el funnel.
- **Contacto** = `api/invoicing/v1/contacts` — objeto fiscal (CIF, dirección) necesario para
  facturar. Se crea **al preparar la propuesta**, como dice D3, con el `createContact()` que ya
  existe (`src/lib/holded.ts:1027`).

Por tanto: Apollo construye la lista → el lead se registra en el CRM del ERP →
al preparar propuesta se crea el contacto fiscal. Todo encaja sin duplicar nada.

**Consecuencia práctica:** Apollo sale de la ruta crítica del ERP. No hace falta
`APOLLO_API_KEY` server-side ni integración propia (con su coste en créditos): la vía natural
es Apollo/landing → lead en Holded, patrón que ya está en producción para las landings
("webhook n8n → crea lead en Holded CRM con tag `erp-medida`", página *Landing: ERP a medida*).

## Estado actual verificado

### Lo que existe y se reutiliza

- **Patrón de sincronización con Holded**: `syncAll()` (`src/lib/sync.ts:1424`), con
  `syncHoldedCompany`, `syncProformas`, `syncJournalEntries`, `syncEmployeesAndSalaryRecords`;
  cron diario en `vercel.json` (`/api/sync` 06:00). El CRM **no añade nada aquí**: su pipeline no
  se sincroniza (D4 revisada). El sync sigue siendo relevante solo para facturas y proformas, que
  es lo que alimenta la ficha 360.
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

Con la D4 revisada el pipeline ya no depende de esta API, así que la mayoría de estas
restricciones **dejan de afectar al CRM**. Quedan las que tocan al único punto de contacto que
sigue vivo, los contactos fiscales de las propuestas (D3):

| Hecho | Consecuencia |
|-------|--------------|
| `GET /contacts` **ignora `page`/`limit`** y devuelve el catálogo completo | El proxy de contactos de las propuestas necesita caché con TTL |
| Errores silenciosos: filtro inválido → `200 []`; recurso inexistente → **400**, no 404; auth por cabecera `key:` | Validar en cliente, no confiar en el status; registrar `x-correlationid` |
| **Cuotas mensuales desde el 1/6/2026**, por plan y **por cuenta** (SL y OU independientes) | Ya afectaba a los syncs existentes; el CRM no las empeora porque no sincroniza |

Para el registro: el CRM de Holded **sí permite escritura** (17 endpoints entre embudos y
oportunidades, con `POST /leads` y `…/leads/{leadId}/stages`). No lo usamos porque el pipeline
vive en el ERP, no porque no se pueda. Si algún día se revierte D4, el camino está confirmado.

## Impacto del plan de activación de Odoo

Gigson incorpora **Odoo Enterprise como nueva línea de negocio**, y la plantilla de activación de
Odoo Partner fija su embudo, sus objetivos de año 1 y una rutina de gobernanza mensual sobre 8
métricas en semáforo. Cuatro consecuencias para este módulo. Aviso previo: la plantilla está **sin
rellenar** (el objetivo €XXK, los nombres y las fechas están en blanco), así que sus cifras son la
proyección que propone Odoo, **no objetivos aprobados** — razón de más para que las metas se
configuren y no se cableen.

1. **El embudo es por línea de negocio, no por marca.** El de Odoo es Leads/Calificación →
   **Demo** → Propuestas → Nuevos proyectos (88/44/22/9 en el año 1, con rampa trimestral
   12/6/3/1 → 20/10/5/2 → 28/14/7/3 ×2). Esa etapa **Demo** no existe en el funnel de la
   estrategia (§7.1). Gigson pasa a tener **dos embudos** (Integraciones/IA y Odoo) y LaTroupe el
   suyo. El modelo lo soporta con un embudo por línea (D11), pero la capa
   de KPIs debe agregarse **por funnel**, no con un único juego de conversiones. La navegación se
   organiza por marca y, dentro de Gigson, por línea.
2. **Metas configurables con semáforo.** La gobernanza es una revisión mensual de 30 min sobre 8
   métricas en Verde (meta alcanzada) / Amarillo (70-99%) / Rojo (<70%). Ni el ERP ni este plan
   tenían modelo de objetivos: se añade `KpiTarget` (F7). Como la rampa es trimestral, la meta
   lleva periodo.
3. **La mitad de esas métricas no son del CRM.** Las de entrega (% a tiempo, desviación de horas,
   CSAT) son de Proyectos y las de negocio (ratio 3x servicios/licencias, usuarios vendidos) de
   Facturación/P&L. Ver matriz y la sección "Fuera del CRM".
4. **Falta el origen del lead.** El deck separa captación *Inside-Out* (base instalada: 5~6
   migraciones) de *Outside-In* (mercado abierto: 3~4 nuevos), con objetivos distintos. Sin un
   campo de origen no se puede reportar ese mix — y LaTroupe lo necesita igual para su "tasa de
   referidos >50%".

### Dónde vive cada métrica

| Métrica | Sección | Fuente | Estado |
|---|---|---|---|
| Leads/mes, por origen | CRM | `CrmLead` | Nuevo (F1/F2) |
| Demos/mes | CRM | entrada en etapa Demo → `CrmLeadStageEvent` | Nuevo; requiere el funnel de Odoo en Holded |
| Propuestas enviadas | CRM | `Budget` + `documensoStatus` | Existe; falta `crmLeadId` (F6) |
| Conversión por etapa, ciclo de venta | CRM | `CrmLeadStageEvent` | Nuevo (F7) |
| Pipeline ponderado | CRM → Previsiones | `amount × probability` | Nuevo (F7) |
| Nuevos proyectos | CRM → Proyectos | lead ganado → `JiraProject` | Nuevo el enlace |
| Nuevos usuarios / seats (~75) | Facturación | `CrmLead.seats` + línea de factura | **Hueco**: no existe el concepto de usuario vendido |
| Ratio 3x servicios/licencias | P&L / Facturación | `InvoiceLine` + `Classification` | Datos sí; **falta distinguir servicio de licencia** |
| % proyectos a tiempo | Proyectos | — | **Hueco**: `JiraProject` no guarda fecha comprometida; Giro sí |
| Desviación horas vs presupuesto | Proyectos | `HourBucket.totalHours` + `BudgetLine.estimatedHours` vs horas reales (Tempo/Giro) | Datos sí; falta el informe |
| CSAT (>80%) | Proyectos / Clientes | — | **Hueco total**: no hay captura |
| Metas y semáforo | Transversal | `KpiTarget` | Nuevo (F7) |
| CAC / CPA por canal | Marketing | Adspirer / Google Ads | Fuera del ERP |

### Propuesta de métricas por marca

**Gigson — Integraciones/IA** (ya fijadas en §8.1 de la estrategia): leads fríos
contactados/semana (15-20), contacto→respuesta >15%, respuesta→discovery >60%,
discovery→propuesta >70%, propuesta→cierre >40%, ticket medio €20-35K, ciclo 30-60 días, leads
orgánicos/mes (10-15 en Q4).

**Gigson — Odoo** (del deck): funnel 88/44/22/9 con rampa trimestral, 9 implantaciones y ~75
usuarios en el año 1, ratio 3x servicios/licencias, mix inside-out (5~6 migraciones) vs outside-in
(3~4 nuevos), y nº de cuentas de la base instalada auditadas.

**LaTroupe** (§8.2 + su modelo de negocio): estudios contactados/semana (10-15),
contacto→conversación >10%, **videollamadas reservadas/mes ≥4** (su equivalente a la "demo" de
Odoo, vía Cal.com), propuestas enviadas, 2-3 proyectos cerrados por semestre, ticket medio
€20-30K, **tasa de referidos >50%** (necesita origen), **retención de clientes activos >90%** (no
es CRM: sale de facturación recurrente por cuenta) y **pipeline por mercado**
UK/US/ES/Nórdicos/Sudáfrica (necesita mercado en el lead, porque su paid está segmentado así). En
entrega, su métrica crítica es la **desviación de horas por perfil**, porque factura de €13/h
(junior) a €45/h (lead) y el margen depende de que el perfil real coincida con el presupuestado.

## Carga inicial de datos (revisión del 2026-09-20)

Existe un inventario previo a la carga, extraído del buzón de jaume@somosgigson.com (sep 2025 –
sep 2026) y del selector de cuentas de Holded: **25 cuentas (16 cliente + 9 lead), 22
oportunidades, 55 contactos y 11 facturas localizadas**, normalizados a cuenta / contacto /
oportunidad. No es una especificación del módulo —no trae pantallas, sincronización ni KPIs—
sino el *qué metemos dentro*. Nada se ha escrito todavía.

Lo que aporta al diseño:

- **Valida el modelo de tres entidades** y su "línea de servicio" es nuestro `lineOfBusiness`.
- **El volumen es diminuto.** 25 cuentas y 22 oportunidades: la paginación y los índices son
  irrelevantes a esta escala. Lo que sí importa sigue siendo la cuota de la API de Holded.
- **El embudo de Odoo ya tiene tracción real**, no es una proyección: ZZEN Labs ganada (10
  usuarios), Boby Brands fase 1 cobrada (+ comisión de partner PO298405), HO Soccer en riesgo
  (15 usuarios), Vidacharmy con propuesta enviada, Visionharbor evaluando.
- **LaTroupe casi no aparece** — solo Marlo en co-branding. Su sección del CRM nace vacía; no
  prometer su cuadro de métricas hasta que haya datos.

### Destino de la carga (D7)

La carga entra **directamente en el ERP**, que con la D4 revisada es el sistema de registro: no
hay espejo que reconciliar, ni identificadores externos que rellenar, ni promoción posterior. Las
cuentas y los contactos entran como tales; las 22 oportunidades entran como `CrmLead` en el
embudo que les corresponda por marca y línea.

Un **script idempotente** (`scripts/import-crm-inventory.ts`) con `--dry-run` por defecto,
deduplicando por dominio y por CIF. Lo único que hay que preparar antes son los embudos y sus
etapas (D11), porque cada oportunidad tiene que caer en una etapa real.

### Decisiones de datos ya resueltas

- **Charming Concept y Only Charming**: sociedades **hermanas** → dos cuentas, relación `SIBLING_OF`.
- **Boby Brands y ZZEN Labs**: Boby es el **holding**, ZZEN una empresa dentro → `HOLDING_OF`.
- **Iknoga y Dream España**: el cliente es **Dream España**; Iknoga es **proveedor de Dream** →
  `SUPPLIER_OF`, y la cuenta facturable es Dream.
- **Z1 Gestión, Holded y Odoo**: cuentas de tipo `PARTNER` (D10), con `referredByAccountId` en los
  leads que trajeron (Z1 aportó al menos Dental de la Vega, Control de Obras Públicas y Raméntol).
- **Comisión de partner de Odoo**: no es cliente ni oportunidad —Odoo nos paga a nosotros—, así
  que va a Facturación, no al CRM (ver "Fuera del CRM").

Quedan sin responder las decisiones por registro del propio artifact (estado de Colvin, contacto
de Bourne Estates, horas vivas de Quick Smile, cierre o no de HO Soccer, titularidad de Kimia
Hogar…). Son datos, no modelo: no bloquean el desarrollo, sí la carga.

## Arquitectura objetivo

```
Apollo.io / LinkedIn SN / landings / referidos de partners   (prospección)
   │  alta del lead: a mano en el ERP, o n8n como ya se hace en las landings
   ▼
ERP /crm  ─ CrmLead + CrmPipeline + CrmStage    ← SISTEMA DE REGISTRO (D4)
   │  tablero, listados, ficha 360, actividades, KPIs y metas.
   │  El cambio de etapa es una operación local: no sale a ningún sistema externo.
   │
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

El tramo propuesta → firma → proforma **ya está escrito**. Lo que añade este plan es todo lo que
queda a la izquierda —pipeline, ficha 360 y actividades— más los dos enganches con las apps de
marca. Holded entra en escena una sola vez, al crear el contacto fiscal de la propuesta.

## Modelo de datos

Prefijo `Crm` porque `Account` ya existe (NextAuth, schema l.26) y `Company` significa *entidad
fiscal propia*, no cliente. Todo el modelo es **propiedad del ERP** (D4 revisada): no hay columnas
espejadas ni reglas de "no sobrescribir en el sync". El único puente con Holded es
`CrmAccount.holdedContactId`, que se rellena al preparar la propuesta (D3).

```prisma
/// Embudo comercial. Uno por línea de negocio (D11): el de Odoo tiene etapa Demo,
/// el de integraciones no, y LaTroupe tiene el suyo. Es el eje por el que se
/// agregan los KPIs — agrupar solo por marca mezclaría las dos líneas de Gigson.
model CrmPipeline {
  id             String  @id @default(cuid())
  name           String
  marca          String?
  lineOfBusiness String? // "INTEGRACIONES" | "ODOO" | "BIM"
  active         Boolean @default(true)
  sortOrder      Int     @default(0)

  stages CrmStage[]
  leads  CrmLead[]

  @@map("crm_pipelines")
}

/// Etapa del embudo. `isWon`/`isLost` evitan inferir el desenlace por el nombre,
/// que es de donde salen los errores en los cálculos de win rate y conversión.
model CrmStage {
  id                 String      @id @default(cuid())
  pipelineId         String
  pipeline           CrmPipeline @relation(fields: [pipelineId], references: [id], onDelete: Cascade)
  name               String
  order              Int
  defaultProbability Int?        // % por defecto al entrar en la etapa
  isWon              Boolean     @default(false)
  isLost             Boolean     @default(false)

  leads CrmLead[]

  @@unique([pipelineId, order])
  @@index([pipelineId])
  @@map("crm_stages")
}

/// Oportunidad comercial. Entidad propia del ERP: no se espeja de ningún sistema
/// externo. Se llama `CrmLead` y no `Opportunity` porque el equipo habla de leads
/// y porque es una sola entidad a lo largo de todo el embudo, no dos.
model CrmLead {
  id         String  @id @default(cuid())
  companyId  String?
  company    Company? @relation(fields: [companyId], references: [id], onDelete: SetNull)

  name        String
  contactName String?
  email       String?
  phone       String?
  amount      Decimal?
  currency    String   @default("EUR")

  pipelineId String?
  pipeline   CrmPipeline? @relation(fields: [pipelineId], references: [id], onDelete: SetNull)
  stageId    String?
  stage      CrmStage?    @relation(fields: [stageId], references: [id], onDelete: SetNull)

  /// Referencia en un sistema externo cuando el canal obliga a registrarla ahí —
  /// p. ej. ZZEN Labs está dada de alta en el CRM de partner de Odoo. Es una
  /// anotación para poder rastrearla, no una integración.
  externalRef    String?
  externalSource String? // "ODOO_PARTNER" | …

  marca             String?  // MARCA_OPTIONS (src/lib/org.ts)
  ownerId           String?  // responsable comercial
  owner             User?    @relation(fields: [ownerId], references: [id], onDelete: SetNull)
  accountId         String?
  account           CrmAccount? @relation(fields: [accountId], references: [id], onDelete: SetNull)
  expectedCloseDate DateTime?
  probability       Int?     // % para el pipeline ponderado (F7)
  origin            String?  // INSIDE_OUT | OUTSIDE_IN | REFERRAL | INBOUND | PARTNER — mix
                             // del plan de Odoo y tasa de referidos de LaTroupe.
  market            String?  // UK | US | ES | NORDICS | ZA — pipeline por mercado (LaTroupe)
  seats             Int?     // usuarios propuestos (objetivo de ~75 usuarios de Odoo)
  dealType          String?  // NEW_BUSINESS | EXPANSION | RENEWAL. Necesario por D9: si cada
                             // frente de un retainer es una oportunidad, sin esto los 7 frentes
                             // de Moda re- cuentan como 7 ventas nuevas e inflan el embudo.
  notes             String?
  projectId         String?  // se rellena al ganar
  project           JiraProject? @relation(fields: [projectId], references: [id], onDelete: SetNull)

  budgets      Budget[]
  activities   CrmActivity[]
  stageHistory CrmLeadStageEvent[]
  contactRoles CrmLeadContact[]

  @@index([stageId]) @@index([pipelineId]) @@index([ownerId]) @@index([marca])
  @@index([expectedCloseDate])
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
  changedAt   DateTime @default(now())
  changedById String?

  @@index([leadId])
  @@map("crm_lead_stage_events")
}

enum CrmLifecycle { LEAD QUALIFIED CUSTOMER CHURNED DISQUALIFIED }
enum CrmAccountType { CLIENT LEAD PARTNER }

/// Cuenta de cliente canónica del ERP: la columna vertebral de la ficha 360.
/// No existe en Holded como tal (Holded tiene leads y contactos, no cuentas).
model CrmAccount {
  id        String  @id @default(cuid())
  name      String
  domain    String? @unique
  vatNumber String?
  type      CrmAccountType @default(LEAD) // D10: PARTNER para Z1, Holded y Odoo. Los
                                          // proveedores NO entran: ya existe `Supplier`.
  lifecycle CrmLifecycle   @default(LEAD)
  sector    String?
  marca     String?
  ownerId   String?
  owner     User?   @relation(fields: [ownerId], references: [id], onDelete: SetNull)

  /// Quién trajo esta cuenta (prescriptor). Sin esto no se puede medir cuánto
  /// negocio aporta cada partner — Z1 ha traído al menos tres clientes.
  referredByAccountId String?
  referredBy          CrmAccount?  @relation("CrmReferrals", fields: [referredByAccountId], references: [id], onDelete: SetNull)
  referrals           CrmAccount[] @relation("CrmReferrals")

  relationsFrom CrmAccountRelation[] @relation("CrmRelationFrom")
  relationsTo   CrmAccountRelation[] @relation("CrmRelationTo")

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

/// Relación tipada entre cuentas (D8). Los casos reales no son una jerarquía única:
/// Charming Concept ↔ Only Charming son hermanas; Boby Brands es el holding de ZZEN
/// Labs; Iknoga es proveedor de Dream España. Cada par es una relación distinta, y
/// cada cuenta mantiene sus propias oportunidades y su propio `holdedContactId`.
enum CrmRelationType { HOLDING_OF SUBSIDIARY_OF SIBLING_OF SUPPLIER_OF ADVISOR_OF }

model CrmAccountRelation {
  id            String          @id @default(cuid())
  fromAccountId String
  fromAccount   CrmAccount      @relation("CrmRelationFrom", fields: [fromAccountId], references: [id], onDelete: Cascade)
  toAccountId   String
  toAccount     CrmAccount      @relation("CrmRelationTo", fields: [toAccountId], references: [id], onDelete: Cascade)
  type          CrmRelationType
  note          String?

  @@unique([fromAccountId, toAccountId, type])
  @@index([fromAccountId])
  @@index([toAccountId])
  @@map("crm_account_relations")
}

model CrmContact {
  id        String     @id @default(cuid())
  accountId String
  account   CrmAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)
  name      String
  email     String?
  phone     String?
  title     String?
  language  String?
  linkedinUrl String?
  isPrimary Boolean @default(false)
  activities CrmActivity[]
  leadRoles  CrmLeadContact[]

  @@unique([accountId, email])
  @@index([accountId])
  @@map("crm_contacts")
}

/// Participación de un contacto en una oportunidad, con su papel en la decisión.
/// Resuelve los asesores externos, que son gente de OTRA cuenta pero mandan en
/// ésta: David Castany (aspeadvisors) en ZZEN, Javier Granado (zinco.ai) en Quick
/// Smile, E. Martín (Veltian) en LUVI. Sin esto habría que duplicarlos como
/// contactos de la cuenta del cliente, falseando a quién pertenecen.
enum CrmDecisionRole { DECISOR PRESCRIPTOR ASESOR_EXTERNO TECNICO ADMINISTRATIVO USUARIO }

model CrmLeadContact {
  id        String          @id @default(cuid())
  leadId    String
  lead      CrmLead         @relation(fields: [leadId], references: [id], onDelete: Cascade)
  contactId String
  contact   CrmContact      @relation(fields: [contactId], references: [id], onDelete: Cascade)
  role      CrmDecisionRole @default(USUARIO)

  @@unique([leadId, contactId])
  @@index([leadId])
  @@map("crm_lead_contacts")
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
5. Actualizar §7.1 de la estrategia en Confluence, que sigue diciendo "Holded / DocuSign", para
   que refleje Documenso (D5).

### F1 — Modelo de datos, embudos y migración (2-3 j)
- `prisma/schema.prisma` + migración `2026xxxxxxxxxx_add_crm_module` con los modelos de arriba.
  **No hay cliente de `api/crm/v1` ni `syncHoldedCrm()`**: el pipeline no se sincroniza con nada.
- Semilla de embudos y etapas (D11): el de Odoo con etapa Demo, el de Gigson integraciones y el de
  LaTroupe, cada uno con `defaultProbability` e `isWon`/`isLost`. Editables después en `/settings`.
- **`Budget.projectId` a nullable** + arreglar los call sites del hueco 2 (commit aparte).
- Backfill `scripts/backfill-crm-accounts.ts`: `CrmAccount` con `lifecycle: CUSTOMER` a partir
  de `(companyId, holdedContactId)` ya presentes en `Invoice`/`Proforma`/`Budget`, nombre desde
  `counterparty`/`clientName`. Idempotente y con `--dry-run` por defecto, como el resto de
  scripts del repo.

### F2 — `/crm/leads`: tablero, listados y cambio de etapa (3-4 j)
- `/crm/leads`: tablero por etapas del embudo (`@dnd-kit` ya instalado), con selector de embudo
  por marca y línea, y listado con filtros por responsable, etapa, origen, mercado y fecha de
  cierre estimada.
- **Cambio de etapa**: arrastrar llama a una server action que actualiza `stageId`, escribe
  `CrmLeadStageEvent` y `AuditLog`, y aplica la `defaultProbability` de la etapa destino si el
  usuario no la ha tocado a mano. Es una operación local — no sale a ningún sistema externo, así
  que no hay relectura de confirmación, ni idempotencia contra terceros, ni estados divergentes.
- `/crm/leads/[id]`: detalle con contactos y su papel en la decisión, actividades, propuestas
  asociadas e historial de etapas.
- Rellenar la subsección CRM del sidebar (`src/components/sidebar.tsx:55`) y actualizar el
  comentario de l.43-44 que hoy dice que está vacía a propósito.

### F3 — eliminada
Era "escritura de etapas hacia Holded". Con la D4 revisada el pipeline no se sincroniza con
Holded, así que el cambio de etapa vive en F2. Se conserva el hueco de numeración para no romper
las referencias a F4–F8.

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
- Enganchar grabaciones de ReadAI por `externalRef` (§7.1 ya lo fija como herramienta de
  discovery). Las actividades son enteramente del ERP: con la D4 revisada ya no hay que decidir
  si se espejan las tareas de lead de Holded.

### F6 — Enganche CRM ↔ apps de marca (2 j)
Amplía el contrato de `docs/proposals-plan-v2.md`. Los consumidores todavía no existen
(`gigsonapps` sin crear, módulo de `lt-tools` pendiente), así que cambiarlo ahora no cuesta:
- `GET /api/webhooks/proposals/contacts`: además de contactos de Holded, devolver cuentas del
  CRM sin contacto fiscal, marcadas con su origen, para poder elegir una que aún no está en
  `invoicing/v1/contacts`. Con caché TTL, porque `/contacts` no pagina y devuelve el catálogo
  entero (playbook §6).
- `POST /api/webhooks/proposals/contacts`: aceptar `crmAccountId`/`crmLeadId` y **escribir de
  vuelta** `holdedContactId` + `holdedSyncedAt` + `lifecycle: QUALIFIED` (D3).
- `POST /api/webhooks/proposals`: aceptar `crmLeadId`, enlazar `Budget.crmLeadId` y hacer
  `projectId` **opcional** (hoy obligatorio, `route.ts:86`).
- `POST /api/webhooks/documenso`: en `DOCUMENT_COMPLETED`, mover el lead a la etapa con
  `isWon` de su embudo y registrar el `CrmLeadStageEvent`.
- Actualizar `docs/proposals-plan-v2.md` con el contrato resultante.

### F7 — KPIs comerciales, metas y semáforo (3-4 j)
- **Reutilizar el framework de KPIs que ya existe**: `src/lib/kpis/` (`KPIFilters`, grupos
  P&L/Cashflow/Derived/Projections, `getAllKPIs()`), expuesto en `/api/kpis` y por MCP
  (`src/lib/mcp/tools/kpis.ts`). Se añade `getCommercialKPIs()` como un grupo más — no un módulo
  nuevo — y se amplía `KPIFilters` con `lineOfBusiness` / `funnelId`.
- Los KPIs no hay que inventarlos: están en §8 de la estrategia y en el deck de Odoo. Métricas:
  leads/mes por origen, demos/mes, propuestas, conversiones por etapa, ciclo de venta (desde
  `CrmLeadStageEvent`), ticket medio, win rate, pipeline ponderado y seats. Cada marca/línea usa
  las suyas según la propuesta de arriba.
- **`KpiTarget`** (modelo nuevo, transversal — no solo CRM): `metric`, `marca`,
  `lineOfBusiness?`, `periodType` (MONTH|QUARTER|YEAR), `periodKey`, `value`. Alimenta el
  semáforo Verde (≥meta) / Amarillo (70-99%) / Rojo (<70%) de la rutina mensual, y sirve igual
  para métricas de entrega y financieras. Se editan en `/settings`, no se cablean.
- **E10 de la reunión**: el CRM aporta la capa que faltaba por delante. Comprometido =
  proformas activas (ya existe); pipeline ponderado (`amount × probability`) = capa nueva
  anterior, como entrada opcional del escenario en `/forecasts`.
- **Horizonte temporal** (decidirlo antes de sumar pipeline, no después):
  `resolveDateRange` (`src/lib/cashflow-data.ts:78-97`) cierra todos los rangos "last_X_months"
  en fin del mes en curso (`lte: endOfCurrentMonth`), así que un lead con `expectedCloseDate`
  posterior queda **fuera** de cualquier filtro de periodo actual. El pipeline necesita su
  propio horizonte hacia adelante (p.ej. "próximos N meses"), no el rango de tesorería.

### F8 — Carga inicial del inventario (1-2 j · después de F1)
- `scripts/import-crm-inventory.ts`: lee el inventario ya revisado, deduplica por dominio y CIF,
  crea cuentas, relaciones (D8), contactos con su papel en la decisión, y oportunidades con su
  etapa y su `dealType`. Idempotente y con `--dry-run` por defecto, como el resto de scripts del
  repo.
- Requisito previo: responder las decisiones por registro que el propio inventario deja abiertas.
  El script no inventa datos que faltan (CIF, importes, fechas de cierre, propietario).
- Ejecutar primero contra la base de `staging` (`refresh-staging-db.yml`).

**Estimación total: ~14-19 jornadas.** F0 y F1 son prerrequisito del resto; F4, F5, F6 y F8 son
independientes entre sí una vez está F1.

## Fuera del CRM, para planificar aparte

Las métricas de entrega y negocio del deck de Odoo no son de este módulo. Cada una tiene su hueco
propio y conviene decidirlas por separado, no colarlas en el CRM:

- **% proyectos a tiempo** → Proyectos. Hueco real: `JiraProject` no guarda fecha comprometida de
  entrega (solo `status`); Giro sí tiene fechas y `giroProjectId` ya enlaza. Decidir origen del
  dato.
- **Desviación de horas vs presupuesto** → Proyectos. Los datos ya están: `HourBucket.totalHours`
  y `BudgetLine.estimatedHours` frente a horas reales de Tempo/Giro. Falta el informe. Para
  LaTroupe, desglosado **por perfil** (tarifas de €13 a €45/h).
- **CSAT >80%** → hueco total, no hay captura. Requiere encuesta post-proyecto y modelo propio.
- **Ratio 3x servicios/licencias y usuarios vendidos** → Facturación/P&L. `InvoiceLine` +
  `Classification` ya clasifican por línea, marca y proyecto, pero **no distinguen servicio de
  licencia**: hace falta una cuenta contable dedicada o una marca de tipo de línea.
- **CAC/CPA por canal** → vive en Adspirer/Google Ads. Dejarlo fuera salvo que se quiera importar
  el coste por canal para calcular CAC contra los leads del CRM.

## Verificación

- Por fase: `pnpm typecheck && pnpm lint && pnpm test` (lo mismo que corre CI en
  `.github/workflows/deploy.yml` y `deploy-staging.yml`, más `pnpm next build`).
- Migraciones: `pnpm prisma migrate dev` en local y revisión del SQL a mano; la rama `staging`
  tiene base propia (`refresh-staging-db.yml`) — probar ahí el backfill antes de producción.
- Tests de dominio nuevos: transiciones de etapa (que escriben un único `CrmLeadStageEvent` y
  aplican la probabilidad por defecto), cálculo de conversiones y ciclo de venta a partir del
  historial, y resolución de la ficha 360 por `(companyId, holdedContactId)`.
- F0 y F6 se verifican con curl contra Preview: son los únicos contratos con sistemas externos
  que quedan.
- Comprobación funcional end-to-end: crear un lead en `/crm/leads` → arrastrarlo de etapa →
  verificar el evento y la probabilidad → prepararle propuesta (curl al webhook) → confirmar
  `Budget.crmLeadId`, el contacto fiscal creado en Holded y el lead en la etapa de ganado.

## Riesgos y decisiones abiertas

1. **Contradice §10 de la estrategia** ("CRM: Holded"), igual que pasó con DocuSign→Documenso.
   Hay que actualizar Confluence y que el equipo comercial sepa que la herramienta del día a día
   pasa a ser el ERP.
2. **Si alguien trabajase leads dentro de Holded, el ERP no se enteraría.** Asumido por D4. Antes
   de la carga conviene confirmar que el CRM de Holded está efectivamente vacío, para no
   abandonar registros que existan.
3. **PII**: la carga trae nombres, teléfonos y correos de personas de empresas que aún no son
   clientes, extraídos de un buzón, y ahora el ERP es su sistema de registro —no un espejo de algo
   que ya vivía en Holded—. Revisar base legal y retención **antes** de ejecutar F8.
4. **Sin roles**: la auth es allowlist SSO (`SsoAllowedEmail`) sin RBAC, así que el pipeline
   comercial será visible a cualquier usuario con acceso al ERP. Pesa más ahora que el ERP es el
   único sitio donde vive. Si no vale, hace falta una fase previa de roles.
5. **El conteo de oportunidades se infla (consecuencia de D9)**: los 7 frentes de Moda re- son 7
   oportunidades. Sin filtrar por `dealType`, las conversiones y el objetivo de "9 implantaciones"
   de Odoo mezclan negocio nuevo con ampliaciones de retainer. Los KPIs de F7 filtran por
   `dealType: NEW_BUSINESS` salvo que se pida lo contrario.
6. **Las cifras de Odoo (88/44/22/9, 9 proyectos, 75 usuarios, 3x) salen de una plantilla sin
   rellenar**: son la proyección que propone Odoo, no objetivos aprobados. Confirmarlas antes de
   cargarlas como `KpiTarget`.
7. **La sección de LaTroupe nace vacía**: en el inventario solo aparece Marlo, y en co-branding.
   No prometer su cuadro de métricas hasta que tenga datos propios.
8. **Las propuestas hoy son "Figma → PDF"** (§7.1). Las apps de marca (D2) tienen que sustituir
   ese flujo manual; hasta entonces el tramo propuesta→firma del ERP no tiene productor real.
9. **`Budget.projectId` nullable** toca `/budgets`, sus server actions, la tabla y la tool MCP:
   transversal aunque pequeño, mejor aislado en su propio commit.
10. **`marca` sigue siendo un string** (`MARCA_OPTIONS`), no un enum. El eje real de agregación es
    `lineOfBusiness` en el embudo, así que el problema queda acotado, pero no resuelto.
