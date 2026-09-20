# Portal de cliente — contrato y estado

> Origen: reunión de dirección del **18/09/2026**, donde se acordó priorizar el portal de
> cliente y las propuestas por encima del CRM. Decisiones de producto tomadas el 20/09/2026.

## Reparto entre repos

| Pieza | Dónde |
|---|---|
| Motor de presupuestos: bolsas, fees, facturas, clientes | **`erp-awesomely`** (este repo) |
| Registro de horas | **Giro** (`~/Projects/giro`), leído por su API v1 |
| Lo que ve el cliente final | **`gigsonapps.com`** / `latroupeapps.com` (repo a crear) |

El ERP no sirve ninguna página al cliente y `gigsonapps` no toca Holded, Giro ni esta base
de datos — mismo reparto que el flujo de propuestas (`docs/proposals-plan-v2.md`).

## Decisiones de producto

- Alcance v1: **bolsas con saldo** y **facturas y proformas**. Fuera el estado de los
  proyectos y el detalle de los partes de horas.
- Acceso del cliente: **enlace mágico por correo**, sin cuenta ni SSO.
- **Solo las horas facturables consumen bolsa.** Una bolsa son horas vendidas: cargar el
  retrabajo interno sería cobrarlo dos veces.
- **Solo las horas aprobadas restan saldo**; las que están sin aprobar se enseñan aparte
  (`pendingApprovalHours`) para que al cliente no le baje el saldo de golpe.
- **El consumo se filtra por la ventana de la bolsa** (`startDate`/`endDate`). Una bolsa sin
  fechas sigue cubriendo todo el histórico, así que las que ya existen no cambian de número.

## Fuente de horas: Giro, no Tempo

`src/lib/hour-buckets.ts` usa Giro cuando el proyecto tiene `giroProjectId`, el workspace
tiene `giroApiKey` y hay `GIRO_BASE_URL`; si no, Tempo.

No hace falta un interruptor por proyecto: el sync de Giro importa los partes de Jira/Tempo
de toda la organización, así que **Giro es un superconjunto** —tiene las horas nativas y las
espejadas—, y para los partes espejados `mirrorApprovalPeriod()` refleja además el estado de
aprobación de Tempo. Con fuente Tempo todo entra como facturable y aprobado, que es
exactamente lo que se calculaba antes de este cambio.

`GET /api/v1/worklogs?projectId=&from=&to=` devuelve por línea `issueKey`, `billable` y
`timesheetStatus` — las tres cosas que Tempo nunca dio y de las que depende el saldo.

**La atribución es por `issueKey`, no por `issueNumericId`**: Giro no expone el id numérico
de Jira, y el único de `IssueHourBucketAssignment` siempre fue `(projectId, issueKey)`. Giro
mantiene paridad de keys con Jira a propósito.

El autor llega como email (`authorEmail`), no como `accountId`. El puente es
`ProjectUserRole.giroUserEmail`; para la gente importada y sin casar, Giro usa un email
sombra `shadow+<accountId>@migrated.giro.internal` del que el accountId se recupera
parseando. Sin match, las horas **no se pierden**: van a `pendingAttributionHours`.

## API del portal

Prefijo propio `/api/portal/`, no `/api/webhooks/`: esto es **salida** de datos de cliente,
no eventos de entrada, y el allowlist de `src/proxy.ts` es donde se audita qué se lee sin
sesión. Auth: cabecera `x-webhook-secret` contra un secreto **por marca y distinto del de
propuestas** — una fuga del secreto de una API de solo lectura no debe poder crear Budgets
ni disparar envíos a firmar.

### `POST /api/portal/clients/resolve`

`{ brand: "SOLUTIONS" | "TROUPE", email }` → `{ clientId, name, marca, contactName,
hasBillingContact, hasLinkedProjects }`.

POST y no GET aunque sea una lectura: el email es un dato personal y en una query string
acabaría en los logs de acceso de la plataforma.

- `404` con `code`: `CLIENT_NOT_FOUND` · `NOT_A_CUSTOMER` · `WRONG_BRAND`
- `409` `AMBIGUOUS_EMAIL` con `accountIds` si el correo aparece en dos cuentas — **no se
  adivina**: que un cliente vea las facturas de otro es el fallo que se lleva por delante la
  funcionalidad entera.

`hasBillingContact` y `hasLinkedProjects` existen para que el portal pueda degradar con
honestidad ("todavía no hay datos") en vez de pintar un cero con aire de dato bueno.

> El portal debe responder **siempre lo mismo** a quien escribe el correo ("si tu correo
> está registrado, recibirás un enlace"). Si no, el formulario se convierte en un oráculo de
> quién es cliente de Gigson.

### `GET /api/portal/clients/:clientId/hour-buckets?brand=`

Por bolsa: `id`, `code`, `label` (nombre del rol), `projectName`, `contractedHours`,
`consumedHours`, `remainingHours`, `usedRatio`, `alertRatio`, `status`
(`ACTIVE`/`NEAR_EXHAUSTION`/`EXHAUSTED`/`EXPIRED`), `startDate`, `endDate`, `expiringSoon`,
`pendingApprovalHours`. Más `totals`, `pendingAttributionHours`, `accuracy`
(`EXACT`/`PENDING_REVIEW`), `computedAt` y `stale`.

`stale`/`computedAt` son funcionales: si el cron lleva un día sin poder actualizar, el
portal tiene que decir "no pudimos actualizar" y **nunca** enseñar un `consumedHours: 0` con
pinta de recién calculado.

### `GET /api/portal/clients/:clientId/documents?brand=&limit=`

Facturas y proformas en una sola llamada (el portal las pinta juntas; dos viajes doblarían
la latencia). `limit` se recorta a 200 en el servidor.

Filtros con peso de seguridad:
- Facturas: `type = SALE` (nunca `PURCHASE`, que son nuestros proveedores) y
  `removedFromHoldedAt = null`.
- Proformas: solo `holdedStatus` 2 (Aprobado) y 4 (Vencida). Fuera 0/1 **Borrador** (trabajo
  interno, no puede llegarle a un cliente), −1 Cancelada y 3 Facturado (ya existe su factura;
  listar las dos le haría creer que debe el doble).

El importe es el **nativo** en su `currency`, no `totalEur`: el cliente tiene que ver lo que
se le facturó.

**Nunca se exponen**: tarifas (`ratePerHour`), nombres o correos del equipo, `projectId`,
`issueKey`, ni el detalle de partes.

## Identidad del cliente

`JiraProject.crmAccountId` → `CrmAccount`. Es el único camino de "cliente X" a "sus bolsas":
antes solo se podía inferir por `Proforma.projectId`, que rellena una persona a mano, de
modo que un proyecto cuya proforma nadie clasificó habría dado un **cero** — un número
equivocado, no un error.

Se rellena con `pnpm tsx scripts/backfill-project-crm-account.ts` (simulacro por defecto,
`--apply` para escribir; **no asigna los ambiguos**) y a mano con el selector "Cliente" de la
ficha del proyecto, que es el mecanismo permanente.

El email del cliente sale de `CrmContact.email`, que es el único correo por persona que hay
en la base de datos.

## Snapshot

`/api/sync/hours` (cron diario a las 07:30) recalcula y deja el resultado en
`HourBucketConsumption` y `ProjectHoursSnapshot`. El portal lee de ahí y **no** llama a Giro
en caliente: `/api/v1/worklogs` no pagina ni acepta límite, y `docs/consumo-api-holded.md`
cuenta cómo acabó la última pelea por volumen de llamadas.

Si un proyecto falla se guarda `lastError` y **se deja la foto anterior**: nunca se escribe
un cero, porque un cero recién calculado es indistinguible de "este cliente no ha consumido
nada".

El proyecto está en **Vercel Hobby**: el tope de 300 s lo pone el plan y los crons tienen
una ventana flexible de una hora. Por eso el cron respeta `syncDeadline()` y prefiere dejar
proyectos sin recalcular (conservan su foto anterior, vieja pero cierta) antes que morir a
medias; los devuelve en `skipped`. **Si `skipped` deja de estar vacío de forma habitual**,
toca repartir los proyectos entre ejecuciones, como ya hace el full de `/api/sync` rotando
una empresa por pasada. Y por eso el umbral de `stale` son 30 h y no 24: con la ventana
flexible, dos pasadas buenas pueden separarse ~25 h.

La pantalla interna del proyecto sigue leyendo en vivo — el equipo quiere el dato fresco y
acepta esperar — pero por el mismo orquestador, para que no puedan divergir.

## Variables de entorno nuevas

`GIGSONAPPS_PORTAL_SECRET`, `LTTOOLS_PORTAL_SECRET`, `PORTAL_SNAPSHOT_STALE_HOURS`
(opcional, 30 por defecto).

`GIGSONAPPS_PORTAL_SECRET` **ya está puesta** en Vercel (Production y Preview, 2026-09-20),
con el mismo valor que `ERP_PORTAL_SECRET` en el proyecto `portal-cliente`. Falta reflejarlas
en `.env.example`. `LTTOOLS_PORTAL_SECRET` no hace falta hasta que exista el portal de
La Troupe.

## Estado real de los datos (comprobado en producción el 2026-09-20)

| | |
|---|---|
| Proyectos vinculados a Giro | **59 de 76** — hecho. Los 11 + 4 pendientes son proyectos de administración de Jira (JIRA Admin, TEST, plantillas) sin equivalente en Giro |
| Claves de API de Giro | Configuradas en los dos workspaces (`gigson`, `latroupe`) |
| `GIRO_BASE_URL` | Configurada desde el 2026-08-29 en los tres entornos |
| Proyectos con bolsas | **4**, con 14 bolsas y 27 issues asignados |
| Proyectos con cliente (`crmAccountId`) | **0** |
| `CrmAccount` / `CrmContact` | **0 / 0 — el CRM está vacío** |

**El único bloqueo que queda es el CRM.** Mientras no haya cuentas, ningún correo resuelve a
ningún cliente y el portal no puede enseñar nada, por mucho que las horas y las bolsas estén
bien.

Los cuatro proyectos que hoy tienen bolsas facturan a estos contactos de Holded — son las
cuatro cuentas que hay que crear para que el portal sirva de algo. Todas con
`lifecycle = CUSTOMER`, `marca = "Gigson Solutions"` y la entidad **Awesomely SL**:

| Proyecto | Cliente | `holdedContactId` |
|---|---|---|
| BUB — GS - Quicksmile | QUICK SMILE SL. | `68fa13d6a007a2270a03c2cc` |
| GB — GS - Bourne | BOURNE ESTATES SL. | `69cb9b2dc367dfeba70c49df` |
| GC — GS - Colvin | COLVIN EUROPE SL. | `693543dcc45d0cc6d3054941` |
| GZG — GS - Z1 Gestión | Z1 GESTION ECONOMICA SL. | `69417531ee502867210c4b17` |

Cada una necesita además un `CrmContact` con el correo de la persona que vaya a entrar: ese
correo es la llave del portal.

Con eso hecho, `pnpm tsx scripts/backfill-project-crm-account.ts --apply` enlaza los
proyectos solo, cruzando por las proformas ya clasificadas.

## Lo que sigue pendiente de una persona

1. **Poblar el CRM** (arriba). Es el bloqueo.
2. **SMTP del portal** (`SMTP_HOST/PORT/USER/PASS`, `MAIL_FROM`, `MAIL_REPLY_TO`). Sin ello
   el circuito funciona pero no sale el correo.
3. **Quitar la Deployment Protection** del proyecto `portal-cliente` en Vercel: hoy redirige
   al SSO de Vercel y ningún cliente tiene cuenta. Es el interruptor de puesta en marcha.
4. **Dominio** del portal. `gigsonapps.com` no está en la cuenta de Vercel.

## Riesgos abiertos

- **La aprobación de horas en Giro no tiene ni un test automatizado** (ese repo entero tiene
  dos ficheros de test) y el saldo del cliente depende de ella. Se validó a mano con tres
  personas; conviene la prueba con Irene que la reunión daba por pendiente **antes** de que
  un cliente vea el número.
- **Si nadie aprueba partes, el saldo se congela**: el cliente vería horas de más y todo el
  consumo en `pendingApprovalHours`. El portal lo enseña, pero es una dependencia operativa
  nueva, no solo técnica.
- `CrmAccount.marca` es nullable: sin marca, el cliente no resuelve a nada. Falla cerrado —la
  dirección correcta— pero en silencio, y por eso `resolve` devuelve códigos distinguibles.

## Pendiente

- Repo `gigsonapps` (Next.js + Vercel + Prisma/Neon): enlace mágico portado de
  `~/Projects/lt-tools/apps/backend/src/design-tracker/invitations.ts`, correo portado de
  `.../src/mail/index.ts`, y las dos vistas.
- Backfill de `endDate = startDate + 1 año` en las bolsas que no tengan fecha de fin. Va
  aparte y revisado, porque mueve números de pantallas internas.
- Bloque E para `user-roles` y `suppliers`, que siguen leyendo de Tempo.
