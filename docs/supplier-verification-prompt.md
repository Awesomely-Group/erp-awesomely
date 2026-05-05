# Prompt para Claude Code CLI — Verificación de horas de proveedores

Copia y pega este prompt en Claude Code en terminal dentro del proyecto `erp-awesomely`.

---

## PROMPT

Implementa el flujo completo de **verificación de horas de proveedores** en este ERP (Next.js 16, Prisma 7, Tailwind CSS 4, PostgreSQL). Sigue exactamente las instrucciones de este documento.

---

### CONTEXTO DEL NEGOCIO

El flujo es:
1. Se aprueban las horas de un proveedor en **Tempo** (aprobación explícita, via Tempo Approvals API)
2. El proveedor envía su **factura** (llega a Holded como PURCHASE invoice con `counterparty` = nombre del proveedor)
3. Se verifica que la factura cuadra con: horas aprobadas × tarifa acordada **Y** que el período de referencia que indica la factura es el correcto
4. Se aprueba para pago (flujo existente en `/payments`)

Restricciones clave:
- Los proveedores se sincronizan desde **Holded** (contactos tipo supplier), NO se crean manualmente. Se enriquecen en el ERP con `jiraAccountId` y `hourlyRate`
- Un proveedor puede trabajar en **múltiples proyectos Jira** → horas se suman de todos
- El **período de facturación es variable** (mensual o quincenal según `dueDate` de la factura)
- El **período de referencia de servicios** está en el contenido de la factura (descripción), no en la fecha de emisión. Hay que validar que lo que dice la factura coincide con el período verificado

---

### PASO 1 — SCHEMA DE PRISMA

Edita `prisma/schema.prisma`. Añade lo siguiente:

**1a. Al modelo `Invoice`, añade la relación:**
```prisma
verifications SupplierVerification[]
```
(junto a `lines`, `auditLogs`, `erpPayments`)

**1b. Añade los nuevos modelos** antes de la sección `// ─── Sync Logs`:

```prisma
// ─── Supplier Verification ────────────────────────────────────────────────────

/// Proveedor sincronizado desde contactos Holded tipo "supplier", enriquecido con datos ERP.
model Supplier {
  id              String  @id @default(cuid())
  holdedContactId String  @unique
  name            String

  // Enriquecimiento ERP (rellena el usuario)
  jiraAccountId String? @unique
  hourlyRate    Float?

  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  verifications SupplierVerification[]

  @@map("suppliers")
}

enum VerificationStatus {
  PENDING
  HOURS_CAPTURED
  INVOICE_RECEIVED
  PERIOD_MISMATCH
  VERIFIED_OK
  VERIFIED_MISMATCH
  APPROVED

  @@map("verification_status")
}

model SupplierVerification {
  id         String   @id @default(cuid())
  supplierId String
  supplier   Supplier @relation(fields: [supplierId], references: [id])

  // Período de verificación (lo que debería cubrir la factura)
  periodStart DateTime
  periodEnd   DateTime

  // Snapshot de horas aprobadas en Tempo
  tempoHours     Float?
  expectedAmount Float?    // tempoHours × supplier.hourlyRate
  capturedAt     DateTime?

  // Factura recibida del proveedor (de Holded)
  invoiceId      String?
  invoice        Invoice? @relation(fields: [invoiceId], references: [id])
  invoicedAmount Float?   // Invoice.totalEur

  // Período de referencia declarado en la factura (distinto de fecha emisión/vencimiento)
  invoiceServicePeriodStart DateTime?
  invoiceServicePeriodEnd   DateTime?
  periodMismatch            Boolean?

  status     VerificationStatus @default(PENDING)
  verifiedBy String?
  verifiedAt DateTime?
  notes      String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([supplierId, periodStart, periodEnd])
  @@map("supplier_verifications")
}
```

Después ejecuta:
```bash
pnpm prisma migrate dev --name supplier-verification
```

---

### PASO 2 — HOLDED: SYNC DE PROVEEDORES

Edita `src/lib/holded.ts`. Añade la interfaz y el método para obtener contactos tipo proveedor:

```typescript
export interface HoldedSupplierContact {
  id: string
  name: string
}
```

Añade el método `getSupplierContacts()` a la clase `HoldedClient`:
```typescript
async getSupplierContacts(): Promise<HoldedSupplierContact[]> {
  const res = await fetch(`${this.baseUrl}/contacts?type=supplier`, {
    headers: this.headers,
  })
  if (!res.ok) throw new Error(`Holded contacts error: ${res.status}`)
  const data = await res.json() as Array<{ id: string; name: string }>
  return data.map(c => ({ id: c.id, name: c.name }))
}
```

---

### PASO 3 — SYNC: SINCRONIZAR PROVEEDORES

Edita `src/lib/sync.ts`. Añade la función `syncSuppliers(companyId: string)`:

```typescript
export async function syncSuppliers(companyId: string): Promise<void> {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } })
  const client = new HoldedClient(company.holdedApiKey)
  const contacts = await client.getSupplierContacts()

  for (const contact of contacts) {
    await prisma.supplier.upsert({
      where: { holdedContactId: contact.id },
      create: {
        holdedContactId: contact.id,
        name: contact.name,
      },
      update: {
        // Solo actualiza el nombre; preserva jiraAccountId y hourlyRate si ya existen
        name: contact.name,
      },
    })
  }
}
```

Dentro de `syncHoldedCompany(companyId)`, llama a `syncSuppliers(companyId)` al final (después del sync de invoices), capturando errores sin romper el sync principal.

---

### PASO 4 — TEMPO: HORAS APROBADAS

Edita `src/lib/tempo.ts`. Añade la interfaz y el método:

```typescript
export interface TempoApprovedHoursResult {
  approvedHours: number
  usedFallback: boolean // true si se usaron todos los worklogs por falta de API de Approvals
}
```

Añade el método `getApprovedHours(jiraAccountId, from, to)` a `TempoClient`:

```typescript
async getApprovedHours(
  jiraAccountId: string,
  from: string, // YYYY-MM-DD
  to: string,   // YYYY-MM-DD
): Promise<TempoApprovedHoursResult> {
  // Intentar API de Approvals de Tempo
  const approvalsUrl = `${this.baseUrl}/4/approvals?accountId=${jiraAccountId}&from=${from}&to=${to}`
  const approvalsRes = await fetch(approvalsUrl, { headers: this.headers })

  if (approvalsRes.ok) {
    const data = await approvalsRes.json() as {
      results: Array<{
        status: { key: string }
        worklogs: Array<{ timeSpentSeconds: number }>
      }>
    }
    const approvedSeconds = data.results
      .filter(r => r.status.key === 'APPROVED')
      .flatMap(r => r.worklogs)
      .reduce((sum, w) => sum + w.timeSpentSeconds, 0)
    return { approvedHours: Math.round((approvedSeconds / 3600) * 100) / 100, usedFallback: false }
  }

  // Fallback: usar todos los worklogs del período
  const worklogs = await this.getWorklogs(undefined, from, to)
  const userHours = worklogs.users.find(u => u.accountId === jiraAccountId)?.hours ?? 0
  return { approvedHours: userHours, usedFallback: true }
}
```

---

### PASO 5 — PÁGINA /suppliers

Crea `src/app/(dashboard)/suppliers/page.tsx` (Server Component):

- Carga todos los `Supplier` activos con su última `SupplierVerification` (ordenada por `periodEnd` desc)
- Muestra una tabla con columnas: Nombre, Tarifa €/h, Jira Account ID, Estado último período, Acciones
- El botón "Editar" abre un form inline (componente `SupplierEnrichForm`) para editar `jiraAccountId` y `hourlyRate`
- Si no hay proveedores, muestra mensaje explicando que se sincronizan desde Holded

Crea `src/app/(dashboard)/suppliers/supplier-enrich-form.tsx` (Client Component):
- Form con dos campos: `jiraAccountId` (text) y `hourlyRate` (number, step 0.01)
- Server action `updateSupplierData(supplierId, jiraAccountId, hourlyRate)` que hace `prisma.supplier.update`

---

### PASO 6 — PÁGINA /suppliers/[id]

Crea `src/app/(dashboard)/suppliers/[id]/page.tsx` (Server Component):

Muestra el detalle del proveedor con:
1. Header: nombre, tarifa/hora, jiraAccountId
2. Botón "Nuevo período" → abre form con `periodStart` y `periodEnd` date pickers
3. Tabla de verificaciones ordenadas por `periodStart` desc

**Columnas de la tabla:**
| Período | Horas aprobadas (Tempo) | Importe esperado | Factura | Período declarado en factura | Importe facturado | Diferencia | Estado | Acciones |

**Componente `VerificationRow`** (Client Component) para cada fila:

Según el `status` de la verificación, muestra acciones disponibles:

- `PENDING` → botón **"Capturar horas"**: llama a `captureTempoHours(verificationId)`, que:
  - Formatea `periodStart`/`periodEnd` como YYYY-MM-DD
  - Llama `tempoClient.getApprovedHours(supplier.jiraAccountId, from, to)`
  - Guarda `tempoHours`, `expectedAmount = tempoHours × supplier.hourlyRate`, `capturedAt`
  - Si `usedFallback: true`, guarda una nota de warning
  - Cambia status → `HOURS_CAPTURED`

- `HOURS_CAPTURED` → botón **"Vincular factura"**: abre panel con:
  - Selector de facturas PURCHASE donde `counterparty ILIKE supplier.name` (case-insensitive, busca en todas las compañías)
  - Campo "Período de referencia en factura": dos date pickers (`invoiceServicePeriodStart`, `invoiceServicePeriodEnd`) — el usuario introduce las fechas que indica la factura
  - Server action `linkInvoice(verificationId, invoiceId, serviceStart, serviceEnd)` que:
    - Calcula `periodMismatch`: `serviceEnd < verification.periodStart || serviceStart > verification.periodEnd`
    - Guarda `invoiceId`, `invoicedAmount = invoice.totalEur`, `invoiceServicePeriodStart`, `invoiceServicePeriodEnd`, `periodMismatch`
    - Cambia status → `INVOICE_RECEIVED`

- `INVOICE_RECEIVED` → botón **"Verificar"**: llama a `verifyPeriod(verificationId)`:
  - Si `periodMismatch === true` → status `PERIOD_MISMATCH`
  - Si `|invoicedAmount - expectedAmount| > 0.01` → status `VERIFIED_MISMATCH`
  - Si todo OK → status `VERIFIED_OK`
  - Guarda `verifiedAt`, `verifiedBy`

- `PERIOD_MISMATCH` o `VERIFIED_MISMATCH` → botón **"Re-vincular factura"** (vuelve a `HOURS_CAPTURED`) + campo de notas

- `VERIFIED_OK` → botón **"Aprobar para pago"**: status → `APPROVED`

**Badge de status** con colores:
- `PENDING` → gris
- `HOURS_CAPTURED` → azul
- `INVOICE_RECEIVED` → amarillo
- `PERIOD_MISMATCH` → rojo con texto "Período incorrecto"
- `VERIFIED_MISMATCH` → naranja con texto "Importe incorrecto"
- `VERIFIED_OK` → verde claro
- `APPROVED` → verde

---

### PASO 7 — SERVER ACTIONS

Crea `src/app/(dashboard)/suppliers/[id]/actions.ts` con las siguientes server actions:

```typescript
'use server'
// createVerification(supplierId, periodStart, periodEnd)
// captureTempoHours(verificationId)  → llama TempoClient.getApprovedHours
// linkInvoice(verificationId, invoiceId, serviceStart, serviceEnd)
// verifyPeriod(verificationId)
// approveForPayment(verificationId)
// updateSupplierData(supplierId, jiraAccountId, hourlyRate)  → puede estar en suppliers/actions.ts
```

Para `captureTempoHours`, necesitas obtener el Tempo token del workspace de Jira (usa `prisma.jiraWorkspace.findFirst({ where: { tempoApiToken: { not: null } } })`).

---

### PASO 8 — SIDEBAR

Edita `src/app/(dashboard)/layout.tsx`. Añade "Proveedores" al array de navegación del sidebar, con el icono `Users` de lucide-react y la ruta `/suppliers`. Ponlo después de "Proyectos" y antes de "Pagos" (o en el orden que tenga sentido con la navegación existente).

---

### PASO 9 — INTEGRACIÓN CON /payments

Edita `src/app/(dashboard)/payments/page.tsx`:

En la query de facturas PURCHASE, añade:
```typescript
include: {
  verifications: {
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: { status: true, periodMismatch: true }
  }
}
```

En la UI de cada fila de factura PURCHASE, muestra un badge junto al nombre del proveedor:
- Si `verification.status === 'APPROVED'` → badge verde "Verificado ✓"
- Si `verification.status === 'PERIOD_MISMATCH'` → badge rojo "Período incorrecto"
- Si `verification.status === 'VERIFIED_MISMATCH'` → badge naranja "Importe incorrecto"
- Si tiene verificación pero no aprobada → badge gris "Pendiente verificar"

---

### VERIFICACIÓN FINAL

Una vez implementado, verifica:

1. `pnpm prisma migrate dev` ejecutado correctamente
2. `pnpm typecheck` sin errores
3. `pnpm dev` arranca correctamente
4. Navega a `/suppliers` → debe listar proveedores (si Holded está configurado, ejecutar sync primero)
5. En `/suppliers/[id]` → crea un período, captura horas, vincula factura, verifica, aprueba
6. En `/payments` → la factura aprobada tiene badge "Verificado ✓"

---

### CONVENCIONES DE CÓDIGO (del CLAUDE.md)

- Nunca usar `any` — usar `unknown` y narrowing
- Return types explícitos en funciones
- Usar `??` no `||`
- Server Components por defecto; solo `'use client'` cuando sea necesario (interactividad)
- Conventional Commits: `feat: descripción`
- NUNCA añadir Co-Authored-By ni atribuciones AI
