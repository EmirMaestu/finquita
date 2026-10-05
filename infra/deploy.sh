#!/usr/bin/env bash
# Deploy en el VPS: construye las imágenes en el servidor y levanta (o actualiza) todo.
#
#   ./infra/deploy.sh           construye con el código que está y levanta
#   ./infra/deploy.sh --pull    primero trae lo último de GitHub (git pull)
#
# Se corre desde el VPS, en la carpeta del repo, con el .env ya completo (ver docs/DEPLOY.md).
# Cada deploy etiqueta las imágenes con el commit: para volver atrás, ver el final.
set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE=(docker compose -f infra/docker-compose.prod.yml --env-file .env)

say() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# Lee una variable del .env sin ejecutarlo (hay valores con espacios y paréntesis).
env_val() { grep -E "^$1=" .env | tail -n 1 | cut -d= -f2- || true; }

# ── Controles ───────────────────────────────────────────────────────────────

command -v docker >/dev/null || fail "Falta Docker. En Hostinger, elegí la plantilla Ubuntu con Docker."
docker compose version >/dev/null 2>&1 || fail "Falta el plugin de Docker Compose."
[ -f .env ] || fail "Falta el .env: copiá .env.example a .env y completalo."

for v in DOMAIN POSTGRES_PASSWORD BETTER_AUTH_SECRET; do
  [ -n "$(env_val "$v")" ] || fail "Falta $v en .env."
done
case "$(env_val DOMAIN)" in *example.com) fail "Cambiá DOMAIN en .env por tu subdominio." ;; esac
case "$(env_val POSTGRES_PASSWORD)" in cambiame*) fail "Cambiá POSTGRES_PASSWORD en .env." ;; esac
case "$(env_val BETTER_AUTH_SECRET)" in cambiame*) fail "Cambiá BETTER_AUTH_SECRET en .env (openssl rand -hex 32)." ;; esac
[ -n "$(env_val RESTIC_REPOSITORY)" ] && [ -n "$(env_val RESTIC_PASSWORD)" ] ||
  printf '\n⚠ Sin RESTIC_REPOSITORY o RESTIC_PASSWORD: la app anda, pero la copia nocturna va a fallar.\n'
[ -n "$(env_val VAPID_PUBLIC_KEY)" ] ||
  printf '⚠ Sin claves VAPID: los avisos quedan en la campana, sin notificaciones push.\n'

# ── Código ──────────────────────────────────────────────────────────────────

if [ "${1:-}" = "--pull" ]; then
  say "Trayendo lo último de GitHub"
  git pull --ff-only
fi

# Las imágenes se construyen acá: el registro y la etiqueta del .env se reemplazan por los locales.
export REGISTRY=mostrador
export TAG
TAG="$(git rev-parse --short HEAD)"
say "Versión $TAG"

# ── Imágenes ────────────────────────────────────────────────────────────────

say "Construyendo la API (también corre el worker)"
docker build -f apps/api/Dockerfile -t "$REGISTRY/api:$TAG" .
say "Construyendo la web (Caddy con la app)"
docker build -f apps/web/Dockerfile -t "$REGISTRY/web:$TAG" .
say "Construyendo el backup"
docker build -f infra/backup/Dockerfile -t "$REGISTRY/backup:$TAG" .

# ── Levantar ────────────────────────────────────────────────────────────────

say "Levantando los servicios (la API aplica las migraciones al arrancar)"
"${COMPOSE[@]}" up -d --remove-orphans

say "Esperando que la API responda"
for i in $(seq 1 30); do
  if "${COMPOSE[@]}" exec -T api bun -e \
    "fetch('http://localhost:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))" \
    >/dev/null 2>&1; then
    break
  fi
  [ "$i" -eq 30 ] && { "${COMPOSE[@]}" logs --tail 40 api; fail "La API no respondió en 60 segundos (arriba, sus últimos logs)."; }
  sleep 2
done

docker image prune -f >/dev/null
"${COMPOSE[@]}" ps

DOMAIN="$(env_val DOMAIN)"
printf '\n\033[32m✓ Listo: https://%s (versión %s)\033[0m\n' "$DOMAIN" "$TAG"
printf '  La primera vez, Caddy tarda unos segundos en sacar el certificado HTTPS.\n'
printf '  Logs:        docker compose -f infra/docker-compose.prod.yml --env-file .env logs -f api\n'
printf '  Volver atrás: REGISTRY=mostrador TAG=<versión anterior> docker compose -f infra/docker-compose.prod.yml --env-file .env up -d\n'
printf '  Versiones:   docker images mostrador/api\n'
