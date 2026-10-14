# ERP — Claude Code Context

This file is read automatically by Claude Code on every session.

---

## Project Overview

**ERP** — ERP intern

**Key constraints:**
<!-- TODO: Document key constraints -->

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Language | TypeScript | Primary language |
| Package Manager | pnpm | Dependency management |
<!-- TODO: Complete tech stack table -->

---

## Project Structure

<!-- TODO: Document project structure -->

---

## Architecture

<!-- TODO: Describe architecture pattern (MVC, DDD, Clean Architecture, etc.) -->

---

## Code Conventions

### General
- **Never use `any`** in TypeScript — use `unknown` and narrow
- **Explicit return types** for functions and methods
- **Use `??`** not `||` for nullish coalescing

### Git
- Conventional Commits: `type: description`
- Types: `feat`, `fix`, `chore`, `refactor`, `test`, `docs`
- **NEVER add Co-Authored-By or AI attributions**
- **NEVER add AI branding to PR descriptions**

---

## Development Commands

Install: pnpm install
Dev: pnpm dev
Test: pnpm test
Typecheck: pnpm typecheck
Lint: pnpm lint
Format: pnpm format

---

## Testing Strategy

<!-- TODO: Define test pyramid (unit/integration/e2e) -->

---

## CI/CD

<!-- TODO: Document CI/CD pipelines -->

---


## Web Frontend
### Skills: senior-frontend (React, Next.js, TypeScript, Tailwind)
### Agents: web-frontend-dev
### Principles: Functional components only, Server components by default, Error boundaries, Tailwind CSS

## Backend Development
### Skills: senior-backend (Node.js, Express, PostgreSQL, Prisma)
### Agents: backend-api-dev, system-architect
### Principles: DDD architecture, Result pattern, Validate DTOs at HTTP layer, Domain events

## UI/UX Design
### Skills: ui-design, figma-integration
### Agents: ui-design-dev
### Principles: WCAG 2.1 AA, contrast>=4.5:1, keyboard accessible, design tokens, dark mode

## Security
### Skills: security (OWASP Top 10, auth, secrets, dependency scanning)
### Agents: security-auditor
### Principles: Validate inputs, no hardcoded secrets, scan dependencies, HTTPS everywhere

## DevOps & CI/CD
### Skills: devops (GitHub Actions, Docker, deployment, monitoring)
### Agents: cicd-engineer
### Principles: Cache dependencies, multi-stage Docker builds, secret management, health checks

## Claude Flow v3 — Multi-Agent Orchestration

### Overview
This project uses **Claude Flow v3 (Ruflo)** for multi-agent orchestration. Claude Code performs ALL actual work (file ops, code generation, git). MCP tools ONLY handle coordination (swarm, memory, routing, messaging).

### Quick Reference
```bash
# Spawn agents
npx ruflo agent spawn -t coder --name my-coder
npx ruflo agent spawn -t tester --name my-tester

# Initialize swarm
npx ruflo swarm init --topology hierarchical --max-agents 8

# Hive-mind tasks
npx ruflo hive-mind spawn "Build feature X" --queen-type tactical
npx ruflo hive-mind status

# Memory operations
npx ruflo memory store <key> <value> --namespace <ns>
npx ruflo memory search --query "pattern"

# Background daemon (learning workers)
npx ruflo daemon start

# System health
npx ruflo doctor
npx ruflo status
```

### Architecture Principles
- **Task Routing**: 3-tier routing (WASM booster → Haiku/Sonnet → Opus + Swarm)
- **Swarm Topologies**: Hierarchical, Mesh, Ring, Star, Hybrid, Adaptive
- **Memory**: Hybrid backend with HNSW vector indexing for fast semantic search
- **Hooks**: Auto-routing via PreToolUse, PostToolUse, SessionStart, SessionEnd hooks
- **SONA**: Self-Optimizing Neural Architecture learns from every task execution

### Skills: swarm-orchestration
### Agents: swarm-coordinator, task-router
### Principles: Multi-agent coordination, hierarchical mesh topology, task decomposition, shared memory, consensus algorithms




---

## API v1, MCP y acceso programático (octubre de 2026)

El acceso programático al ERP se rehízo entero, portando el modelo de Giro. Lo que hay
que saber antes de tocar esta zona:

- **Toda clave nace de una concesión nominal** (`ApiAccessGrant`) que un ADMIN otorga a
  una persona, con caducidad (90 días por defecto). Lo que puede hacer se recalcula en
  **cada petición** como `clave ∩ concesión ∩ permisos vivos del dueño`, nunca se lee de
  la fila. La pertenencia viva aquí es **`SsoAllowedEmail`**: quitar un email de ahí
  corta el login y corta también sus claves.
- **Conceder y acuñar son dos actos y dos pantallas.** El ADMIN autoriza; la persona
  autorizada crea sus claves. Si las creara el ADMIN, el valor en claro pasaría por sus
  manos y viajaría por Slack, y una credencial que ha estado en un chat ya no lo es.
- **`companyIds`/`marcas` son la frontera de datos y no son opcionales.** Se inyectan en
  el `where` desde la credencial; **nunca** se aceptan como parámetro. Un `?companyId=`
  solo puede acotar dentro de lo permitido, y pedir una fuera de alcance devuelve vacío
  — no 403, que ya confirmaría que esa sociedad existe.
- **Los scopes se separan por sensibilidad, no por tabla.** `payroll:read` y `cash:read`
  exigen ADMIN vivo: el primero toca `Employee.iban`, el segundo el saldo y los pagos
  individuales (distinto de los agregados de `finance:read`, que ya circulan en
  informes). Un `COMERCIAL` solo puede ejercer `crm:read`, que es lo único que ve por
  pantalla. **No existe ningún scope de borrado**, y hay un test que lo impide.
- **Revocar es marcar, no borrar.** La fila con su `lastUsedAt` es lo que dice desde y
  hasta cuándo estuvo viva una credencial. Retirar una concesión revoca en cascada sus
  claves.
- **`/api/v1/*` autentica con Bearer en `apiRoute`**, que exige declarar el scope en cada
  ruta: sin declararlo no compila. Las rutas internas de la app (`authenticateRequest`)
  son **solo sesión** desde octubre: aceptar también `x-api-key` dejaba dos puertas al
  mismo dato con reglas distintas.
- **El middleware (`src/proxy.ts`) usa cuatro reglas por prefijo**, no un allowlist ruta
  a ruta. El allowlist literal se había desincronizado de lo que los handlers aceptaban.
  `/api/v1` queda fuera de la excepción de login en local a propósito: si ahí se pudiera
  entrar sin Bearer, una prueba manual pasaría y producción fallaría.
- **El MCP vive en `/api/v1/mcp`** y se construye **por petición**, registrando solo las
  herramientas que los permisos de la clave dan — `tools/list` devuelve distinto según
  quién pregunte. El contexto viaja por clausura, nunca como argumento de una
  herramienta. **Las nóminas no se exponen al MCP en ninguna circunstancia**, ni con su
  permiso: un IBAN de una persona física no tiene por qué pasar por la ventana de
  contexto de un modelo.
- **Solo tres escrituras** (`src/lib/writes.ts`), compartidas entre API y MCP. La regla
  para entrar: el ERP tiene que ser la fuente de verdad del dato y el cambio tiene que
  deshacerse desde una pantalla. Fuera: pagos, nóminas, borrados, disparar un sync
  (300 s de reloj), aprobar/enviar presupuestos y firma, CRM y comisiones, y todo lo que
  escriba en Holded.
- **`ERP_API_KEY` está en retirada.** Era una clave maestra sin dueño, sin caducidad y
  sin permisos. Ya no vale para el MCP ni para `/api/kpis`. Queda viva solo como
  alternativa a `CRON_SECRET` en `webhooks/jira` y `webhooks/holded`; se retira
  introduciendo `WEBHOOK_SYNC_SECRET` y vigilando el `console.warn` de la rama legacy.

### Dos cosas que bloquean el desarrollo local y conviene arreglar

1. **`src/lib/prisma.ts` usa siempre `@prisma/adapter-neon`**, que habla por WebSocket y
   no sabe conectarse a un Postgres normal. No hay forma de levantar el ERP contra una
   base local: cualquier prueba real apunta a la Neon de **producción**. Giro resuelve
   esto eligiendo el adapter por el host de la URL.
2. Al intentar arreglarlo aparece lo de debajo: **algún componente cliente acaba
   importando `prisma`** (`src/app/(dashboard)/pl/pl-client.tsx` lo destapa), así que el
   bundler intenta meter `pg` en el bundle del navegador. Hasta que eso se separe, el
   punto 1 no se puede cerrar.

Mientras tanto, las rutas de `/api/v1` se prueban **como handlers** con `prisma`
mockeado (`src/app/api/v1/routes.test.ts`), que es la verificación honesta disponible.

## Current Phase

Bloque E (el ERP deja de leer de Jira/Tempo y lee de Giro): **los tres consumidores de
pantalla están migrados**. Sostienen el cutover el puente de identidad `GiroUserLink`,
`src/lib/hours-source.ts` con su tercer estado `UNAVAILABLE`, y los dos scripts
(`sync-giro-user-links.ts` para rellenar el puente, `compare-hours-giro-vs-tempo.ts`
como criterio objetivo del cutover).

- `api/jira/users` → **`api/people`** (y las dos páginas de proveedores).
- `api/projects/[projectId]/user-roles` pasa por `projectAuthors()` y devuelve
  `{source, entries}`.
- `api/tempo/worklogs` **borrada** → `api/projects/[projectId]/hours`, con los dos
  únicos modos que tenían consumidor (`month-cost` y `hierarchical`); los otros cuatro
  no los llamaba nadie y se fueron con la ruta.

Tres cosas que hay que tener presentes al tocar esto:

- **El coste de estas pantallas es el de proveedor**, calculado en el ERP con
  `Supplier.hourlyRate` / `ProjectUserRole.ratePerHour`. El que calcula Giro
  (`/api/v1/project-cost`, usado por `/reconciliation`) es la tarifa **interna**. Son
  dos números distintos; mientras los catálogos no coincidan, dos pantallas dirán
  cosas distintas del mismo proyecto y hay que rotular cuál es cuál.
- **Nada se cae en silencio.** Una persona que llega de Giro sin `accountId` conserva
  sus horas con tarifa 0 y se nombra en `sinPuente`; un proyecto sin fuente responde
  `UNAVAILABLE`, nunca 0.
- **`hasHoursSource`, no `hasTempoToken`.** El gate de las pantallas lo decide
  `resolveHoursSource`, no la presencia del token de Tempo.

Después del cutover: `captureTempoHours`, `syncJiraWorkspace` → `syncGiroWorkspace`, y
borrar `TempoClient`/`JiraClient`.

---

**Last updated:** 2026-10-14
