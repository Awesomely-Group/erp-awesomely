# Plan: AW Proposals — Extensión de /budgets en erp-awesomely

## Context

El ERP Awesomely (`erp.awesomelygroup.com`) ya tiene una sección `/budgets` con modelo Prisma (`Budget`, `BudgetLine`, `PaymentTerm`), templates por marca (SOLUTIONS/TROUPE), integración con Holded y estado DRAFT/ACTIVE/COMPLETED/ARCHIVED. El objetivo es extender este sistema para añadir:

1. **Un configurador mejorado** con drag & drop de secciones de servicio, precios por tarifa BUILD/DISCOVER, y lógica de descuento Discovery+Implementación
2. **Un link público compartible** (`erp.awesomelygroup.com/p/[token]`) para que el cliente vea y acepte la propuesta
3. **Tracking de engagement** (PostHog) con notificaciones a Jaume por email
4. **Aceptación digital** con creación automática de proforma en Holded

**Repositorio:** `https://github.com/Awesomely-Group/erp-awesomely`  
**No se crea repo nuevo.** Todo va en el ERP existente.

---

## Stack (heredado del proyecto)

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js 16 (App Router) |
| ORM | Prisma 7 + Neon PostgreSQL |
| Auth | NextAuth v5 (SSO Google, SsoAllowedEmail) |
| Estilos | Tailwind 4 + Geist font |
| Drag & drop | **añadir** @dnd-kit/core |
| Analytics | **añadir** PostHog |
| Email | **añadir** Resend |
| Holded | Holded REST API (ya existe patrón en el repo) |

---

## Análisis del modelo existente

### Lo que ya existe y se puede reusar

```
Budget {
  id, projectId, name, type (PRECIO_CERRADO|BOLSA_DE_HORAS|FEE_REGULAR)
  region, amount, currency, estimatedHours, monthlyFee
  status (DRAFT|ACTIVE|COMPLETED|ARCHIVED)
  template (SOLUTIONS|TROUPE)           ← marca
  clientName, holdedContactId, companyId, holdedDocId
  lines[], paymentTerms[], classifications[]
}

BudgetLine {
  lineType (ROL|ACTIVIDAD), roleId, phase, task
  estimatedHours, pvpPerHour, costPerHour
  concept, quantity, unitPrice, sortOrder
}

PaymentTerm {
  order, valueType (PERCENTAGE|AMOUNT), value, dueDate
  description, proformaId
}
```

### Lo que hay que añadir al schema Prisma

```prisma
model Budget {
  // ... campos existentes ...
  
  // NUEVO — propuesta pública
  token          String?   @unique   // URL-safe token para link público
  validUntil     DateTime?           // expiración de la propuesta
  accessType     String    @default("token")  // "token" | "password"
  passwordHash   String?
  clientEmails   String[]  @default([])       // emails autorizados
  sentAt         DateTime?                    // cuando se envió al cliente
  
  // NUEVO — versionado
  version        Int       @default(1)
  parentId       String?
  parent         Budget?   @relation("BudgetVersions", fields: [parentId], references: [id])
  versions       Budget[]  @relation("BudgetVersions")
  
  // NUEVO — resumen ejecutivo y condiciones
  executiveSummary String?
  paymentConditions String?
  
  // NUEVO — tracking
  firstOpenedAt  DateTime?
  events         BudgetEvent[]
  accepts        BudgetAccept[]
}

// Extensión de BudgetLine
model BudgetLine {
  // ... campos existentes ...
  rateType       String?   // "BUILD" (70€/h) | "DISCOVER" (100€/h)
  serviceType    String?   // "discovery"|"desarrollo"|"integracion"|"consultoria"|"devops"|"qa"|"pm"|"mantenimiento"
  deliverables   String[]  @default([])
}

// NUEVO
model BudgetEvent {
  id         String   @id @default(cuid())
  budgetId   String
  budget     Budget   @relation(fields: [budgetId], references: [id], onDelete: Cascade)
  eventType  String   // "opened"|"section_viewed"|"scroll_depth"|"time_spent"
  ip         String?
  userAgent  String?
  metadata   Json?
  createdAt  DateTime @default(now())

  @@index([budgetId])
  @@map("budget_events")
}

// NUEVO
model BudgetAccept {
  id                   String   @id @default(cuid())
  budgetId             String
  budget               Budget   @relation(fields: [budgetId], references: [id], onDelete: Cascade)
  email                String
  ip                   String?
  timestamp            DateTime @default(now())
  holdedProformaId     String?
  holdedProformaNumber String?

  @@index([budgetId])
  @@map("budget_accepts")
}
```

---

## Lógica de precios (nueva)

```typescript
// src/lib/budget-pricing.ts
const RATES = { DISCOVER: 100, BUILD: 70 } as const

export function calcBudget(lines: BudgetLine[], sentAt?: Date) {
  const discoverTotal = lines
    .filter(l => l.rateType === 'DISCOVER')
    .reduce((acc, l) => acc + (l.unitPrice ?? (l.estimatedHours ?? 0) * RATES.DISCOVER), 0)

  const buildTotal = lines
    .filter(l => l.rateType === 'BUILD')
    .reduce((acc, l) => acc + (l.unitPrice ?? (l.estimatedHours ?? 0) * RATES.BUILD), 0)

  const hasDiscount = discoverTotal > 0 && buildTotal > 0
  const discountAmount = hasDiscount ? discoverTotal * 0.5 : 0
  const discountExpiry = sentAt
    ? new Date(sentAt.getTime() + 30 * 24 * 60 * 60 * 1000)
    : null

  return { discoverTotal, buildTotal, subtotal: discoverTotal + buildTotal,
           discountAmount, discountExpiry, hasDiscount }
}
```

---

## Catálogo de servicios — carga dinámica desde Holded

Los servicios disponibles en el configurador se cargan en tiempo real desde Holded, **por empresa** (Awesomely SL para Gigson, Awesomely OU para latroupe). Cada empresa puede tener servicios distintos.

### Flujo de carga

```typescript
// src/app/api/holded/services/route.ts
// GET /api/holded/services?companyId=xxx
export async function GET(req: Request) {
  const companyId = new URL(req.url).searchParams.get("companyId")
  const company = await prisma.company.findUnique({ where: { id: companyId } })
  const client = new HoldedClient(company.holdedApiKey)
  const services = await client.fetchFromBase(HOLDED_BASE_URL, "/services")
  return Response.json(services)
}
```

El `HoldedClient` ya existe en `src/lib/holded.ts` con `fetchFromBase()` y manejo de auth headers. Solo hay que añadir el método `listServices()`.

### Mapeo de tarifa por nombre de servicio

Holded devuelve `{ id, name, price, ... }`. Se mapea la tarifa BUILD/DISCOVER automáticamente por nombre:

```typescript
// src/lib/budget-pricing.ts
const DISCOVER_KEYWORDS = ["discovery", "consultor", "dirección", "estrategia", "auditoría"]

function inferRateType(serviceName: string): "DISCOVER" | "BUILD" {
  const lower = serviceName.toLowerCase()
  return DISCOVER_KEYWORDS.some(k => lower.includes(k)) ? "DISCOVER" : "BUILD"
}
```

El usuario puede sobrescribir la tarifa manualmente en el configurador.

### Tarifas fijas del sistema

| Tipo | Tarifa |
|------|--------|
| DISCOVER | 100€/h |
| BUILD | 70€/h |

El precio unitario del servicio en Holded se ignora para el cálculo de propuestas — siempre se usa horas × tarifa (o precio fijo si se especifica). El servicio de Holded sirve solo como catálogo de nombres/conceptos.

---

## Archivos a crear/modificar

### Schema y migración
- `prisma/schema.prisma` — añadir campos a `Budget`, `BudgetLine`, nuevos modelos `BudgetEvent`, `BudgetAccept`
- `prisma/migrations/XXXX_budget_proposals/` — migración generada

### Rutas admin (protegidas por NextAuth)
```
src/app/(dashboard)/budgets/
├── page.tsx                          MODIFICAR — añadir columnas token/validez/estado envío
├── [budgetId]/
│   ├── page.tsx                      MODIFICAR — añadir tab "Propuesta"
│   ├── budget-detail.tsx             MODIFICAR — nuevo configurador con drag&drop
│   ├── proposal-config.tsx           CREAR — tab configuración propuesta
│   └── proposal-events.tsx           CREAR — timeline de tracking
```

### Ruta pública (sin auth)
```
src/app/p/
└── [token]/
    ├── page.tsx                      CREAR — Server Component (fetch budget by token)
    ├── proposal-view.tsx             CREAR — UI cliente
    └── accept-modal.tsx              CREAR — modal aceptación
```

### API routes
```
src/app/api/
├── budgets/[budgetId]/
│   ├── send/route.ts                 CREAR — genera token, envía email cliente
│   └── accept/route.ts              CREAR — acepta, crea proforma Holded, notifica Jaume
├── budgets/[budgetId]/track/route.ts CREAR — eventos PostHog/DB
├── holded/contacts/route.ts         CREAR — proxy búsqueda contactos por companyId
└── holded/services/route.ts         CREAR — lista servicios Holded por companyId (ambas empresas)
```

### Lib
```
src/lib/
├── budget-pricing.ts                 CREAR — calcBudget(), inferRateType()
├── resend.ts                         CREAR — emails transaccionales
└── posthog-server.ts                 CREAR — cliente PostHog server-side
```
`HoldedClient.listServices()` — añadir método a `src/lib/holded.ts` (ya existe la clase con `fetchFromBase`)

### Variables de entorno a añadir
```
RESEND_API_KEY
NEXT_PUBLIC_POSTHOG_KEY
NEXT_PUBLIC_POSTHOG_HOST=https://eu.posthog.com
NOTIFICATION_EMAIL=jaume@somosgigson.com
```
Las API keys de Holded ya existen como `Company.holdedApiKey` en BD.

---

## Configurador de propuesta (UI en budget-detail)

### Tab nuevo "Propuesta" en `/budgets/[id]`

**Sección 1 — Secciones de servicio** (drag & drop con @dnd-kit)
- Panel izquierdo: catálogo de servicios cargados dinámicamente desde Holded (según empresa seleccionada), con tarifa inferida automáticamente y chip BUILD/DISCOVER
- Panel derecho: líneas añadidas y reordenables (`BudgetLine` con `rateType` y `serviceType`)
- Cada línea expandible: título, descripción, entregables (tags), horas estimadas o precio fijo, tarifa (override manual)
- Cálculo en tiempo real con subtotales y descuento Discovery+Build

**Sección 2 — Resumen ejecutivo y condiciones**
- `executiveSummary` (textarea)
- `paymentConditions` (textarea)

**Sección 3 — Configurar envío**
- Validez: 15 días / 1 mes / fecha custom → `validUntil`
- Acceso: link público (token) / email+contraseña
- Emails autorizados + contraseña si aplica
- Botón **"Generar link y enviar"** → POST `/api/budgets/[id]/send`

**Sección 4 — Estado y tracking**
- Link copiable `erp.awesomelygroup.com/p/[token]`
- Timeline de eventos (aperturas, duración, secciones visitadas)
- Estado: borrador / enviado / visto / aceptado / expirado

---

## Vista pública (`/p/[token]`)

- Sin layout del ERP (página standalone)
- Header: logo Gigson o latroupe según `template`
- Badge versión (v1, v2...) + validez
- Si expirada: grayed out + badge "Propuesta expirada"
- Contador de descuento si aplica (días restantes para el 50%)
- Secciones ordenadas según `sortOrder`
- Tabla resumen de precios
- Botón sticky **"Aceptar propuesta"** → modal email + checkbox aceptación
- PostHog: tracking automático de scroll, clics, tiempo por sección

---

## Flujo de aceptación

```
Cliente pulsa "Aceptar" → modal
  → POST /api/budgets/[id]/accept { email, ip }
    → Guardar BudgetAccept en DB
    → Calcular si descuento aplica (sentAt + 30 días)
    → POST Holded API /documents/proform (con API key de Company)
    → Actualizar Budget.status = ACTIVE, holdedDocId
    → Email confirmación al cliente (Resend)
    → Email notificación a jaume@ (Resend) con todos los detalles
```

---

## Notificaciones Resend

| Evento | Destinatario | Contenido |
|--------|-------------|-----------|
| Propuesta enviada | jaume@ + cliente | Link, importe, descuento disponible, validez |
| Primera apertura | jaume@ | Hora, IP, dispositivo |
| Aperturas adicionales | jaume@ | Tiempo en página, secciones vistas |
| Aceptación | jaume@ + cliente | Email firmante, timestamp, nº proforma Holded, importe final |
| 48h antes de expirar | jaume@ | Recordatorio con link admin |

---

## Skill Claude (`/create-proposal`)

### Ubicación y distribución

```
erp-awesomely/
└── .claude/
    └── skills/
        └── create-proposal.md    ← en el repo, disponible para todo el equipo
```

Al estar en `.claude/skills/` dentro del repo `erp-awesomely`, **cualquier miembro del equipo que clone el repo y abra Claude Code tendrá la skill disponible automáticamente** como `/create-proposal`.

### Flujo conversacional completo

El flujo tiene dos fases bien diferenciadas: **definición** (conversacional con Claude) y **formalización** (envío al ERP).

**Fase 1 — Definición conversacional**
1. Pregunta marca: ¿Gigson Solutions o latroupe? → determina `template` y empresa Holded
2. Pregunta cliente → usa holded-mcp `list_contacts` para buscar en tiempo real → usuario selecciona
3. Pregunta qué necesita el cliente (lenguaje libre)
4. Claude propone secciones de servicio (cargadas desde Holded según empresa) con horas estimadas y tarifa inferida
5. Refinamiento iterativo: "añade mantenimiento", "reduce discovery a 10h", "ponle precio fijo al desarrollo"
6. Claude muestra resumen actualizado tras cada cambio:
   ```
   ── Resumen ──────────────────────────────────
   Discovery (10h × 100€)          1.000€  DISCOVER
   Desarrollo (80h × 70€)          5.600€  BUILD
   ────────────────────────────────────────────
   Subtotal                        6.600€
   Descuento Discovery (si acepta en 30d)  -500€
   Total con descuento             6.100€
   ────────────────────────────────────────────
   ```
7. Usuario dice **"OK"** → Claude pregunta validez (15 días / 1 mes / fecha)

**Fase 2 — Formalización en el ERP**

8. Claude llama `POST /api/budgets` con el JSON estructurado → crea el `Budget` en estado DRAFT en el ERP
9. Claude devuelve:
   ```
   ✓ Propuesta creada en el ERP
   → Revisa y ajusta en: erp.awesomelygroup.com/budgets/[id]
   
   Desde ahí puedes:
   - Ajustar secciones con drag & drop
   - Configurar el acceso del cliente (link / contraseña)
   - Generar el link público y enviárselo al cliente
   ```

El ERP es donde se formaliza el envío — Claude solo crea el borrador. El configurador visual del ERP es el punto de revisión final antes de enviar al cliente.

### Endpoint autenticado para la skill

```typescript
// src/app/api/budgets/route.ts (POST — ya existe para crear budgets)
// Autenticación: API key de servicio o sesión NextAuth
// La skill incluye instrucciones para configurar la API key como variable de entorno
```

La skill incluye en su documentación cómo configurar `ERP_API_KEY` como variable de entorno de Claude Code para que las llamadas a la API del ERP estén autenticadas.

---

## Fases de implementación

### Fase 1 — Schema y migración
- [ ] Añadir campos a `Budget` y `BudgetLine` en `prisma/schema.prisma`
- [ ] Crear modelos `BudgetEvent` y `BudgetAccept`
- [ ] Generar y aplicar migración Prisma

### Fase 2 — Configurador con drag & drop
- [ ] Instalar @dnd-kit/core
- [ ] Crear tab "Propuesta" en `budget-detail.tsx`
- [ ] Componente `proposal-config.tsx` con secciones arrastrables
- [ ] `src/lib/budget-pricing.ts` con `calcBudget()`
- [ ] API route `send/route.ts` (genera token, envía email)

### Fase 3 — Vista pública cliente
- [ ] `src/app/p/[token]/page.tsx` (Server Component, sin auth)
- [ ] `proposal-view.tsx` con diseño Gigson/latroupe según template
- [ ] `accept-modal.tsx` con validación email
- [ ] API route `accept/route.ts` + integración Holded proforma
- [ ] PostHog tracking client-side

### Fase 4 — Notificaciones y tracking
- [ ] Instalar Resend, crear `src/lib/resend.ts`
- [ ] Emails: apertura, aceptación, expiración (48h antes)
- [ ] Componente `proposal-events.tsx` en admin
- [ ] Cron job o webhook para expiración

### Fase 5 — Skill Claude
- [ ] `erp-awesomely/.claude/skills/create-proposal.md` — prompt completo con flujo conversacional, instrucciones de holded-mcp, cálculo de precios y llamada al ERP
- [ ] Endpoint `POST /api/budgets` autenticado con API key de servicio para que la skill pueda crear borradores
- [ ] Documentar en CLAUDE.md del repo cómo configurar `ERP_API_KEY` en variables de entorno locales

---

## Archivos críticos (lectura previa a implementar)

| Archivo | Por qué |
|---------|---------|
| `prisma/schema.prisma` | Entender modelo completo antes de migrar |
| `src/app/(dashboard)/budgets/[budgetId]/budget-detail.tsx` | Entender UI actual antes de extender |
| `src/app/(dashboard)/budgets/[budgetId]/page.tsx` | Patrón de fetch de datos |
| `src/app/(dashboard)/budgets/actions.ts` | Server actions existentes |
| `src/lib/auth.ts` | Config NextAuth para proteger rutas |
| `src/components/ui/` | Primitivos UI disponibles para reusar |

---

## Verificación

1. **Migración:** `prisma db push` sin errores, nuevos campos visibles en Studio
2. **Configurador:** crear budget con sección DISCOVER + BUILD, verificar cálculo descuento en tiempo real
3. **Token y acceso:** generar link `/p/[token]`, abrir en incógnito, verificar vista cliente
4. **Expiración:** forzar `validUntil` al pasado, verificar UI grayed out
5. **Aceptación:** click "Aceptar", verificar `BudgetAccept` en DB + proforma en Holded sandbox
6. **Notificaciones:** verificar emails en Resend dashboard tras apertura y aceptación
7. **PostHog:** verificar eventos en dashboard PostHog tras visitar `/p/[token]`
