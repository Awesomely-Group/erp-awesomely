# Staging — erp-staging.awesomelygroup.com

Una copia del ERP donde probar ramas y migraciones contra los datos reales de ayer sin
tocar producción. Montado sobre lo que ya existía desde junio de 2026 y completado el
5 de noviembre de 2026.

## Piezas

| Pieza  | Qué es                                                                                                                                                                                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Vercel | El **mismo** proyecto `erp-awesomely`, conectado por Git. El dominio `erp-staging.awesomelygroup.com` está asignado a la rama git `staging`; Vercel construye esa rama con las variables del entorno **Preview**.                                                              |
| Neon   | Rama `staging` del proyecto de Neon del ERP. Se refresca cada día a las 05:00 UTC desde producción (`refresh-staging-db.yml`).                                                                                                                                                 |
| GitHub | Entorno `staging` con los secretos `DATABASE_URL` (producción, de donde se copia), `DATABASE_URL_STAGING` (pooled), `DIRECT_DATABASE_URL` (directa) y otros de Neon. El repo es público, así que los secretos de entorno funcionan aunque la organización esté en GitHub Free. |
| DNS    | CNAME `erp-staging` en Hostinger (`awesomelygroup.com`) al host que indica Vercel en Settings → Domains.                                                                                                                                                                       |
| Google | El cliente OAuth compartido con Giro (proyecto GCP 279218574333) tiene `https://erp-staging.awesomelygroup.com/api/auth/callback/google` como redirect URI.                                                                                                                    |

Sin proyecto Vercel aparte: todo lo que ya estaba (dominio, hook, rama de Neon, secretos)
estaba hecho sobre la rama `staging` del proyecto de producción, y no hay motivo para
duplicarlo.

## Desplegar en staging

Actions → **Deploy staging** → Run workflow → rama o commit. El workflow:

1. comprueba que la base de staging no es la de producción (`.github/scripts/check-staging-db.sh`);
2. lint, typecheck, tests y build;
3. `prisma migrate deploy` contra la rama `staging` de Neon (endpoint directo);
4. mueve la rama git `staging` a ese commit. Vercel la ve y despliega.

Un push directo a `staging` también vale: Vercel despliega por su cuenta y el workflow
comprueba y migra en paralelo. El deploy puede acabar antes que la migración; en staging
es tolerable.

El dominio de staging está fuera de la protección de previews de Vercel
(`all_except_custom_domains`), así que no hace falta cuenta de Vercel para entrar: manda el
login del ERP, con la misma lista de emails permitidos que producción (viene en la copia).

## Variables de Preview en Vercel

Las que tiene que haber en el entorno Preview del proyecto `erp-awesomely`:

| Variable                                | Valor                                                                                                                                                          |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                          | La pooled de la rama `staging` de Neon. **Comprobar el host** en Settings → Environment Variables: tiene que ser el de la rama `staging`, no el de producción. |
| `AUTH_SECRET`                           | Uno nuevo (`openssl rand -base64 32`), distinto del de producción.                                                                                             |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Los mismos que producción.                                                                                                                                     |
| `GIRO_BASE_URL`                         | Giro producción. El ERP solo lee de Giro.                                                                                                                      |
| `GIGSONAPPS_PORTAL_SECRET`              | Puede quedarse: es un secreto de entrada, no de salida.                                                                                                        |

Y las que **no** tiene que haber en Preview, a propósito:

- `CRON_SECRET`: sin él, los crons de `vercel.json` reciben 401 y no sincronizan nada.
- `GOOGLE_CHAT_WEBHOOK_URL`: avisaría al chat real desde staging.
- `DOCUMENSO_*`, `HOLDED_*`, `ADS_WEBHOOK_SECRET`, `WEBHOOK_SYNC_SECRET`, `ERP_API_KEY`.

Vercel no deja leer una variable `sensitive` una vez guardada, así que si hay duda sobre
`DATABASE_URL` de Preview, se sustituye por la cadena de la rama `staging` y listo.

## Datos: qué trae la copia y qué se apaga

La copia es `pg_dump` de producción entero, nóminas e IBAN de empleados incluidos. Quien
entra en staging ve lo mismo que en producción con un día de retraso.

Las **claves de Holded viven en la base** (`Company.holdedApiKey`), así que la copia las
trae. El refresco las deja vacías justo después de copiar: desde staging, el sync y la
creación de presupuestos en Holded fallan con 401 en vez de escribir en la contabilidad
real. Para probar algo de Holded en staging, pegar una clave a mano en esa fila; el
siguiente refresco la vuelve a quitar. Las credenciales de Jira, Tempo y Giro se quedan:
el ERP solo lee de ahí.

Tras copiar, el refresco aplica `prisma migrate deploy` con el código de la rama
`staging`. Sin eso, una migración probada por la tarde desaparecería a las 05:00 y la app
desplegada quedaría rota contra el esquema viejo.

Para refrescar fuera de hora: Actions → **Refresh staging database from production** →
Run workflow.

## Previews de pull request

Al estar el proyecto conectado por Git, cada rama empujada tiene también su preview
`erp-awesomely-git-<rama>-awesomelygroup.vercel.app`, construida con las mismas variables
de Preview: misma base de staging, mismo login. Esas URLs sí están detrás de la
protección de Vercel (solo la cuenta del equipo entra), y cada PR comparte la base con
staging, así que una migración en una rama de PR no se aplica sola: solo la aplica
**Deploy staging**.

## Lo que queda abierto

- Cada push a `main` despliega producción dos veces: una Vercel por Git (antes de que
  corra `prisma migrate deploy`) y otra el hook de `deploy.yml` después. No es de
  staging, pero es el mismo mecanismo.
- `VERCEL_DEPLOY_HOOK_URL_STAGING` y el hook `staging` de Vercel ya no los usa nadie.
