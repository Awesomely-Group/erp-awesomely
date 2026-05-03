# Giro — Plugin de Jira para gestión de tiempo

Sustituto de Tempo. Plugin nativo de Jira (Atlassian Forge) integrado con el ERP.

---

## Funcionalidades

- Registro de tiempo en issues de Jira
- Planificación de capacidad del equipo
- Workflow de aprobación de timesheets (manager aprueba)
- Tarifas y facturación (integrado con Holded vía ERP)
- Multi-workspace (múltiples orgs de Jira)
- Reports internos con control por roles
- Integración bidireccional con el ERP

---

## Arquitectura

```
Jira UI (Forge Custom UI — React + Atlaskit)
    ↓ Forge resolver (capa de traducción de contexto)
ERP /api/tempo/  ←→  PostgreSQL Neon (tablas tt_*)
    ↓ Phase 3
HoldedClient → facturas
```

### Principios

- **Forge Custom UI** con Atlaskit — UI idéntica a Jira, dark mode automático
- **Backend en el ERP** — nueva ruta `/src/app/api/tempo/` en el Next.js existente
- **Misma DB Neon** — tablas nuevas con prefijo `tt_` vía Prisma migration
- **Resolver fino** — el resolver de Forge solo pasa contexto; toda la lógica vive en el ERP
- **Timesheets semanales** — unidad de aprobación = 1 semana ISO por empleado por workspace
- **Sin revisión de Atlassian** — uso interno, instalación directa vía `forge install`

---

## Estructura de archivos

```
erp-awesomely/
├── docs/
│   └── giro-plugin.md          ← este archivo
├── giro/                       ← Forge app (Atlassian Forge CLI)
│   ├── manifest.yml
│   ├── package.json
│   └── src/
│       ├── resolvers/
│       │   ├── index.ts
│       │   ├── time-entries.ts
│       │   ├── timesheets.ts
│       │   ├── capacity.ts
│       │   └── reports.ts
│       └── frontend/
│           └── src/
│               ├── pages/
│               │   ├── IssuePanel.tsx       ← log time en issue
│               │   ├── MyTimesheets.tsx     ← vista empleado
│               │   ├── TeamTimesheets.tsx   ← vista manager
│               │   ├── FinanceReports.tsx   ← vista finanzas/admin
│               │   └── AdminPage.tsx        ← config workspace
│               ├── components/
│               └── lib/
│                   ├── api.ts              ← fetch wrapper al resolver
│                   └── types.ts
└── src/
    └── app/
        └── api/
            └── tempo/                      ← backend del plugin en el ERP
                ├── _middleware.ts
                ├── time-entries/route.ts
                ├── timesheets/
                │   └── [id]/
                │       ├── route.ts
                │       ├── submit/route.ts
                │       ├── approve/route.ts
                │       ├── reject/route.ts
                │       └── recall/route.ts
                ├── capacity/route.ts
                ├── rates/route.ts
                ├── employees/route.ts
                ├── reports/
                │   ├── summary/route.ts
                │   ├── billable/route.ts
                │   └── export/route.ts
                └── billing/
                    ├── preview/route.ts
                    └── export/route.ts
```

---

## Módulos de Jira

| Módulo | Descripción |
|--------|-------------|
| `jira:issuePanel` | Panel "Log Time" en cada issue |
| `jira:projectPage` | Tab "Capacity & Planning" en cada proyecto |
| `jira:globalPage` | "Mis Timesheets" — todos los roles |
| `jira:globalPage` | "Timesheets del equipo" — manager y admin |
| `jira:globalPage` | "Finanzas & Billing" — admin y finance |
| `jira:adminPage` | Configuración: tarifas, roles, empleados, festivos |

---

## Roles

| Rol | Permisos |
|-----|----------|
| `EMPLOYEE` | Log time propio, enviar timesheet, ver sus reports |
| `MANAGER` | Todo EMPLOYEE + aprobar/rechazar timesheets de su equipo, ver capacity |
| `ADMIN` | Todo MANAGER + gestionar tarifas, roles, exportar billing, cerrar períodos |
| `FINANCE` | Solo lectura de timesheets aprobados, reports de billing, exportar CSV/ERP |

---

## Modelo de datos (PostgreSQL — prefijo `tt_`)

Tablas a añadir en `prisma/schema.prisma`:

```
tt_employees              — perfil ERP de cada persona, vincula User ↔ Jira
tt_employee_workspaces    — un empleado puede estar en múltiples orgs de Jira
tt_roles                  — roles por workspace (EMPLOYEE/MANAGER/ADMIN/FINANCE)
tt_timesheets             — 1 registro por empleado por semana ISO por workspace
tt_time_entries           — registros individuales de tiempo (FK → timesheet)
tt_approval_events        — audit trail del workflow de aprobación
tt_rates                  — tarifas (internas y facturables) con resolución por jerarquía
tt_capacity_plans         — horas planificadas por empleado/proyecto/semana
tt_holidays               — calendario de festivos por workspace
tt_billing_exports        — exportaciones de billing a Holded
tt_billing_export_lines   — líneas de cada exportación
```

### Resolución de tarifas (orden de prioridad)

```
entry override > project+employee > project > employee > workspace (global)
```

### Columna nueva en tabla existente

```sql
-- Añadir a jira_workspaces para identificar el org en Forge context
ALTER TABLE jira_workspaces ADD COLUMN cloud_id TEXT UNIQUE;
```

---

## API `/api/tempo/`

Protegida con `X-Forge-Secret` (shared secret entre Forge resolver y ERP).
El resolver inyecta `X-Forge-Account-Id` y `X-Forge-Cloud-Id` desde el contexto de Forge.

### Middleware

```
verifyForgeSecret → resolveEmployee → attachRoles → handler
```

### Endpoints principales

```
# Time entries
GET/POST        /api/tempo/time-entries
PUT/DELETE      /api/tempo/time-entries/:id

# Timesheets
GET             /api/tempo/timesheets
POST            /api/tempo/timesheets/:id/submit
POST            /api/tempo/timesheets/:id/approve
POST            /api/tempo/timesheets/:id/reject
POST            /api/tempo/timesheets/:id/recall
POST            /api/tempo/timesheets/:id/lock

# Capacity
GET             /api/tempo/capacity
PUT             /api/tempo/capacity-plans

# Tarifas
GET/POST        /api/tempo/rates
DELETE          /api/tempo/rates/:id

# Empleados y roles
GET/POST/PUT    /api/tempo/employees
GET/POST/DELETE /api/tempo/employees/:id/roles

# Reports
GET             /api/tempo/reports/summary
GET             /api/tempo/reports/billable
GET             /api/tempo/reports/cost
GET             /api/tempo/reports/export.csv

# Billing
POST            /api/tempo/billing/preview
POST            /api/tempo/billing/export
GET             /api/tempo/billing/exports

# Config
GET/PUT         /api/tempo/workspaces/:cloudId/settings
GET/POST/DELETE /api/tempo/holidays
```

---

## Integración con el ERP

### Archivos clave a modificar

| Archivo | Cambio |
|---------|--------|
| `prisma/schema.prisma` | Añadir todos los modelos `tt_*` |
| `src/lib/holded.ts` | Añadir `createInvoice()` para push de billing (Fase 3) |
| `src/lib/jira.ts` | Añadir `getAllWorkspaceUsers()` para seed inicial de `tt_employees` |
| `src/app/(dashboard)/profitability/page.tsx` | Enriquecer con coste laboral de `tt_time_entries` (Fase 4) |

### Flujo de notificaciones

```
Empleado envía timesheet
  → ERP actualiza estado
  → ERP llama a Forge webtrigger URL (FORGE_WEBTRIGGER_URL env var)
  → Forge webtrigger notifica al manager en Jira
```

### Variables de entorno nuevas

```env
FORGE_API_SECRET=        # shared secret Forge ↔ ERP
FORGE_WEBTRIGGER_URL=    # endpoint Forge para notificaciones push
```

---

## Plan de implementación

### Fase 1 — Fundación (semanas 1-4)
**Objetivo:** log de tiempo funcional desde issues de Jira

- [ ] Añadir `cloud_id` a `jira_workspaces` (migration)
- [ ] Añadir todos los modelos `tt_*` en `prisma/schema.prisma` (migration)
- [ ] Middleware `/api/tempo/` (verificación secret + resolución de empleado)
- [ ] Endpoints CRUD de `time-entries` y `timesheets`
- [ ] Script seed: poblar `tt_employees` desde usuarios Jira existentes
- [ ] Scaffold Forge app: `forge create` con template Custom UI
- [ ] `manifest.yml` con `jira:issuePanel`
- [ ] Panel "Log Time" en React + Atlaskit
- [ ] Página "Mis Timesheets" (solo lectura)
- [ ] `jira:adminPage` básico (mapeo empleado ↔ cuenta Jira)

### Fase 2 — Aprobaciones y Capacity (semanas 5-8)
**Objetivo:** workflow de aprobación completo + planificación de capacidad

- [ ] Endpoints submit / approve / reject / recall en timesheets
- [ ] Audit log de aprobaciones (`tt_approval_events`)
- [ ] Sistema de roles (`tt_roles` + endpoints)
- [ ] Endpoints capacity planning
- [ ] Forge webtrigger para notificaciones al manager
- [ ] Upgrade "Mis Timesheets": submit / recall desde UI
- [ ] Página "Timesheets del equipo" (manager: aprobar/rechazar)
- [ ] `jira:projectPage` con gráfico capacity (planned vs. actual)
- [ ] UI gestión de roles en admin page

### Fase 3 — Tarifas y Billing (semanas 9-12)
**Objetivo:** importes calculados, exportación a CSV, push a Holded

- [ ] Endpoints CRUD de tarifas + lógica de resolución por jerarquía
- [ ] Snapshot de tarifa en cada time entry al crear/enviar
- [ ] Endpoints reports (summary, billable, cost)
- [ ] Exportación CSV
- [ ] Endpoints billing preview + export
- [ ] `HoldedClient.createInvoice()` para push a Holded
- [ ] UI gestión de tarifas en admin page
- [ ] Página "Finanzas & Billing" (rol FINANCE/ADMIN)
- [ ] Modal de preview antes de exportar
- [ ] Botón exportar a Holded con confirmación

### Fase 4 — Multi-workspace, reports avanzados y polish (semanas 13-16)
**Objetivo:** producción completa, profitabilidad enriquecida

- [ ] Agregación cross-workspace en reports
- [ ] Enriquecer `/profitability` con coste laboral de `tt_time_entries`
- [ ] Flujo de cierre de período (lock masivo)
- [ ] Capacity planning alineado con sprints de Jira
- [ ] Aprobación en bloque (manager aprueba todos los timesheets del período)
- [ ] Vista "Mis Reports" para empleados
- [ ] Config avanzada: semana laboral, festivos, billable por defecto
- [ ] Historial y auditoría de tarifas

---

## Setup inicial (cuando se retome)

### Prerrequisitos

```bash
# Instalar Forge CLI
npm install -g @forge/cli

# Login con cuenta Atlassian developer
forge login

# Verificar acceso al workspace
forge whoami
```

### Scaffold del plugin

```bash
# En la raíz del proyecto
forge create giro
# Seleccionar: Custom UI → Jira Issue Panel

cd giro
forge install --site tuorg.atlassian.net
forge tunnel   # desarrollo en local contra Jira real
```

### Primera migration de Prisma

```bash
# Desde la raíz del ERP
pnpm prisma migrate dev --name add-giro-time-tracking
```

---

## Referencias

- [Atlassian Forge docs](https://developer.atlassian.com/platform/forge/)
- [Atlaskit components](https://atlassian.design/components)
- [Forge Custom UI guide](https://developer.atlassian.com/platform/forge/custom-ui/)
- [Forge tunnel (dev mode)](https://developer.atlassian.com/platform/forge/tunneling/)
