#!/usr/bin/env bash
# Comprueba que la base de staging no es la de producción antes de migrarla o machacarla.
#
# Lo usan `deploy-staging.yml` y `refresh-staging-db.yml`. Los secretos viven en el
# entorno `staging` de GitHub (el repo es público, así que los secretos de entorno sí
# existen aquí; en Giro, privado y en GitHub Free, no, y por eso allí van con prefijo).
# Aun así, un copia-pega equivocado en ese entorno dejaría `DATABASE_URL_STAGING` apuntando
# a producción y el refresco haría `DROP SCHEMA` sobre la base real. Esto falla en cerrado.
#
# Entrada:
#   PROD_DATABASE_URL            producción (de donde se copia)
#   STAGING_DATABASE_URL         staging, pooled (la que usa la app)
#   STAGING_UNPOOLED_DATABASE_URL  staging, directa (la que usa `prisma migrate deploy`)
#
# Nunca imprime una cadena de conexión: solo qué comprobación ha fallado.
set -euo pipefail

# Host de una URL de Postgres sin credenciales, puerto, ruta ni el sufijo `-pooler`: la
# conexión directa y la pooled de un mismo endpoint de Neon son la misma base.
db_host() {
  local rest="${1#*://}"
  rest="${rest%%[/?]*}"
  rest="${rest##*@}"
  rest="${rest%%:*}"
  rest="${rest/-pooler./.}"
  printf '%s' "$rest" | tr '[:upper:]' '[:lower:]'
}

fail() {
  echo "::error::$1" >&2
  exit 1
}

[ -n "${PROD_DATABASE_URL:-}" ] || fail "Falta DATABASE_URL (producción) en el entorno staging."
[ -n "${STAGING_DATABASE_URL:-}" ] || fail "Falta DATABASE_URL_STAGING en el entorno staging."
[ -n "${STAGING_UNPOOLED_DATABASE_URL:-}" ] || fail "Falta DATABASE_URL_STAGING_UNPOOLED en el entorno staging."

prod=$(db_host "$PROD_DATABASE_URL")
staging=$(db_host "$STAGING_DATABASE_URL")
direct=$(db_host "$STAGING_UNPOOLED_DATABASE_URL")

[ -n "$prod" ] && [ -n "$staging" ] && [ -n "$direct" ] || fail "Alguna cadena de conexión no tiene host reconocible."
[ "$staging" != "$prod" ] || fail "DATABASE_URL_STAGING apunta al mismo host que producción."
[ "$direct" != "$prod" ] || fail "DATABASE_URL_STAGING_UNPOOLED apunta al mismo host que producción."
[ "$direct" = "$staging" ] || fail "DATABASE_URL_STAGING_UNPOOLED y DATABASE_URL_STAGING no son el mismo endpoint de Neon."

echo "Staging y producción son bases distintas."
