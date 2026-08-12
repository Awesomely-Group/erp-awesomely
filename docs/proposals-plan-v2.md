# Plan v2: Presupuestos y Propuestas — gigsonapps.com / latroupeapps.com / erp-awesomely

> Sustituye a `docs/proposals-plan.md` (archivado, ver nota al principio de ese archivo).
> Conserva del plan original: lógica de precios BUILD/DISCOVER, configurador drag&drop y la
> skill conversacional `/create-proposal`. Cambia: el link de cliente y la firma ya no
> viven en `erp.awesomelygroup.com` sino en `gigsonapps.com`/`latroupeapps.com` + Documenso.

## Contexto

El equipo necesita crear propuestas comerciales sin entrar en el ERP, y que los clientes de
cada marca las vean/firmen bajo su propio dominio (`gigsonapps.com` para Gigson Solutions,
`latroupeapps.com` para LaTroupe). `erp-awesomely` centraliza las piezas sensibles
(credenciales de Holded, integración de firma con Documenso) porque ya tenía el 90% del
plumbing financiero (`Budget`/`BudgetLine`/`PaymentTerm`, `HoldedClient`), mientras que
`lt-tools` (repo de `latroupeapps.com`) y `gigsonapps` (repo por crear) no tenían nada de
esto.

## Arquitectura

```
[Equipo LaTroupe] → apps/web (lt-tools, módulo proposals)
[Equipo Gigson]   → apps/web (gigsonapps, módulo proposals — repo a crear, misma arquitectura que lt-tools)
        │  buscan/crean cliente en Holded, configuran propuesta, suben PDF
        ▼
POST /api/webhooks/proposals   (erp-awesomely)
        │  crea Budget + BudgetLine + PaymentTerm, sube PDF a Documenso, envía a firmar
        ▼
[Cliente abre / firma en Documenso]
        │
POST /api/webhooks/documenso   (evento DOCUMENT_COMPLETED)
        ▼
HoldedClient.createDocument("proform", …) + PaymentTerm.proformaId enlazado
+ Proforma.marca/projectId auto-clasificados
        │
syncProformas() nocturno (sin cambios) → visible en /proformas
```

## Contrato — erp-awesomely (implementado en esta fase)

### `POST /api/webhooks/proposals`
Auth: header `x-webhook-secret` contra `GIGSONAPPS_PROPOSALS_SECRET` o
`LTTOOLS_PROPOSALS_SECRET` según `brand` en el body (nunca `ERP_API_KEY`/`CRON_SECRET`).
Idempotente por `(sourcePlatform, externalRef)`.

```json
{
  "brand": "SOLUTIONS" | "TROUPE",
  "externalRef": "uuid de la plataforma llamante",
  "projectId": "JiraProject.id",
  "name": "string",
  "type": "PRECIO_CERRADO" | "BOLSA_DE_HORAS" | "FEE_REGULAR",
  "region": "UK" | "US" | "EU" | "OTHER",
  "amount": 1234.56,
  "currency": "EUR",
  "clientName": "string",
  "holdedContactId": "id de Holded (buscado o creado antes, ver más abajo)",
  "companyId": "Company.id (obligatorio — determina qué cuenta de Holded se usa)",
  "executiveSummary": "string",
  "paymentConditions": "string",
  "validUntil": "2026-09-30",
  "lines": [{ "lineType": "ROL" | "ACTIVIDAD", "phase": "", "task": "", "estimatedHours": 0, "pvpPerHour": 0, "concept": "", "quantity": 0, "unitPrice": 0, "rateType": "BUILD" | "DISCOVER", "serviceType": "", "deliverables": [] }],
  "paymentTerms": [{ "order": 1, "valueType": "PERCENTAGE" | "AMOUNT", "value": 50, "dueDate": "2026-09-01", "description": "" }],
  "pdfUrl": "https://…/propuesta.pdf",
  "signerName": "string",
  "signerEmail": "string"
}
```
Respuesta `201`: `{ budgetId, documensoDocumentId, signingUrl }`.

### `GET /api/webhooks/proposals/:budgetId/status?brand=`
Devuelve `{ budgetId, status, documensoStatus, documensoDocumentId, holdedDocId, holdedSyncedAt }`.

### `GET /api/webhooks/proposals/contacts?brand=&companyId=&q=`
Proxy de `HoldedClient.getClientContacts` — buscador de clientes sin exponer credenciales
de Holded a las apps de marca.

### `POST /api/webhooks/proposals/contacts`
Alta de contacto nuevo en Holded. Campos confirmados contra la documentación oficial
(`https://www.holded.com/es/desarrolladores/referencia-api/contactos/crear-un-contacto`,
API v2 `POST /contacts`): `name` (único obligatorio a nivel de API, pero el formulario
exige también `vatNumber`), `vatNumber`, `isPerson`, `email`, `phone`,
`billAddress: { address, city, postalCode, province, country, countryCode }`. `type` se
fija siempre a `"client"`.

### `POST /api/webhooks/documenso`
Webhook de Documenso. En `DOCUMENT_OPENED` marca `documensoStatus: VIEWED`. En
`DOCUMENT_COMPLETED`: crea la proforma real en Holded (`createDocument("proform", …)`,
mismo patrón que `createHoldedQuote` en `budgets/actions.ts`), enlaza
`PaymentTerm.proformaId`, y fija `Proforma.marca`/`projectId` automáticamente (cierra el
hueco que antes solo se resolvía a mano vía `classifyProforma()`). Idempotente por
`Budget.holdedDocId`.

## Cambios de schema (implementados)

`Budget`: `sourcePlatform`, `externalRef` (+ `@@unique([sourcePlatform, externalRef])`),
`executiveSummary`, `paymentConditions`, `validUntil`, `sentAt`, `documensoDocumentId`,
`documensoStatus`.

`BudgetLine`: `rateType` (BUILD/DISCOVER, heredado del plan original — sobre todo para
Gigson Solutions), `serviceType`, `deliverables[]`.

Migración: `prisma/migrations/20260812120000_add_budget_proposals_integration/` — ya
aplicada contra la base de datos real (Neon).

## Archivos nuevos/modificados en esta fase (erp-awesomely)

- `prisma/schema.prisma`
- `prisma/migrations/20260812120000_add_budget_proposals_integration/migration.sql`
- `src/lib/holded.ts` — `createContact()`, `listServices()`
- `src/lib/documenso.ts` (nuevo) — `createDocumentFromPdf`, `distributeDocument`,
  `getDocument`, `verifyWebhookSignature`
- `src/lib/proposals-brand.ts` (nuevo) — mapeo `brand` → `marca`/`sourcePlatform`/secreto
- `src/lib/budget-pricing.ts` (nuevo) — `calcBudget()`, `inferRateType()`, tarifas
  BUILD (70€/h) / DISCOVER (100€/h), heredado de `docs/proposals-plan.md`
- `src/app/api/webhooks/proposals/route.ts` (nuevo)
- `src/app/api/webhooks/proposals/[budgetId]/status/route.ts` (nuevo)
- `src/app/api/webhooks/proposals/contacts/route.ts` (nuevo)
- `src/app/api/webhooks/documenso/route.ts` (nuevo)
- `src/proxy.ts` — sin cambios (el prefijo `/api/webhooks/` ya bypasea auth de sesión)

## Pendiente de ejecutar (antes de dar por cerrada esta fase)

1. **Configurar variables de entorno nuevas** en Vercel (Production y Preview):
   `DOCUMENSO_API_KEY`, `DOCUMENSO_WEBHOOK_SECRET`, `DOCUMENSO_BASE_URL` (opcional, default
   cloud), `GIGSONAPPS_PROPOSALS_SECRET`, `LTTOOLS_PROPOSALS_SECRET`.
2. **Probar el flujo end-to-end con curl/Postman** simulando una plataforma externa (sin
   esperar a que exista `gigsonapps` ni el módulo de `lt-tools`): crear propuesta → firmar
   en Documenso → confirmar proforma real en Holded + `PaymentTerm.proformaId` enlazado.
3. **Verificar el header real de firma del webhook de Documenso** —
   `verifyWebhookSignature()` en `src/lib/documenso.ts` asume `x-documenso-signature` +
   HMAC-SHA256 sin haber podido confirmarlo contra la documentación pública (ver comentario
   en el propio archivo). Confirmar contra la configuración real del webhook en Documenso.
4. **Confirmar el esquema de creación de documentos de Documenso** (`createDocumentFromPdf`
   en `src/lib/documenso.ts`) contra una cuenta real — la API pública de Documenso está en
   migración hacia el modelo "envelope" (v2) y el mapeo campo a campo no se pudo probar en
   vivo.

## Fases siguientes (no implementadas en esta sesión)

- **`lt-tools`**: nuevo módulo `apps/backend/src/proposals/*` + rutas en `apps/web`
  (formulario de creación con buscador/alta de cliente, configurador de líneas, envío a
  `/api/webhooks/proposals`).
- **`gigsonapps`**: nuevo repo, mismo esqueleto que `lt-tools` (Hono + Drizzle + Postgres +
  Vite/React + Docker Compose), mismo módulo `proposals`, con el configurador drag&drop
  (`@dnd-kit`) y las tarifas BUILD/DISCOVER del plan original.
- **Skill conversacional `/create-proposal`**: adaptar la propuesta original (ahora
  llamando a la API del módulo `proposals` de la plataforma de marca correspondiente en vez
  de a `erp-awesomely` directamente).

## Riesgos abiertos

- Residencia de datos de Documenso Cloud para PII de firmantes.
- Confirmar si Gigson Solutions y LaTroupe comparten cuenta de Holded o son distintas
  (ya soportado por diseño: `companyId` es obligatorio en el payload).
- Comportamiento ante caída de Documenso (no hay reintento automático de envío todavía —
  si `createDocumentFromPdf`/`distributeDocument` falla, el `Budget` queda creado en
  `DRAFT` sin link de firma; hay que decidir un flujo de reintento manual o automático).

## Incidente durante el desarrollo (12 ago 2026)

Esta fase se implementó dos veces: la primera implementación se perdió por completo por un
error del agente (un `rm -rf` con una ruta relativa mal calculada borró la carpeta local
`~/Projects` — ver historial de la sesión). La base de datos real nunca se vio afectada
(es un servidor remoto), así que la migración no tuvo que reaplicarse, solo recrearse el
archivo local con el mismo nombre. El código de esta fase es la reconstrucción fiel de esa
primera implementación.
