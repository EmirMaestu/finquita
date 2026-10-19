#!/bin/sh
# Levanta una instalación aislada de Mostrador para la QA con usuarios.
#   scripts/qa/up.sh <slot 1-5> [seed|vacio]
# Slots 1-3 usan su cluster de Postgres (544N); 4 y 5 usan bases _aN en el cluster de 5432.
# Puertos como en e2e/env.ts: API 3100+N*10 (vacía 3101+N*10), web 5174+N*10 (vacía 5175+N*10).
# Requiere el build de la web ya hecho (bun run --cwd apps/web vite build).
set -eu
SLOT=$1
MODE=${2:-seed}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"
case $SLOT in
  1|2|3) PG=544$SLOT ;;
  *) PG=5432 ;;
esac
if [ "$MODE" = vacio ]; then
  API=$((3101 + SLOT * 10)); WEB=$((5175 + SLOT * 10)); EMPTY=1
else
  API=$((3100 + SLOT * 10)); WEB=$((5174 + SLOT * 10)); EMPTY=0
fi
mkdir -p qa/infra/logs qa/infra/run
export DATABASE_URL="postgres://mostrador:mostrador@localhost:$PG/mostrador"
export E2E_SLOT=$SLOT LOG_LEVEL=warn OFF_DISABLED=1 FILES_DIR="qa/infra/files-$SLOT"
export BETTER_AUTH_SECRET=secreto-qa-con-largo-suficiente-1234567890
[ "$EMPTY" = 1 ] && export E2E_EMPTY=1
setsid nohup bun apps/api/scripts/e2e-api.ts > "qa/infra/logs/api-$SLOT.log" 2>&1 &
echo $! > "qa/infra/run/api-$SLOT.pid"
API_URL="http://localhost:$API" setsid nohup bun run --cwd apps/web vite preview --port "$WEB" --strictPort > "qa/infra/logs/web-$SLOT.log" 2>&1 &
echo $! > "qa/infra/run/web-$SLOT.pid"
for _ in $(seq 1 60); do
  if curl -fs "http://localhost:$WEB/api/health" > /dev/null 2>&1; then
    echo "slot $SLOT ($MODE): API :$API · web http://localhost:$WEB · postgres :$PG"
    exit 0
  fi
  sleep 1
done
echo "slot $SLOT no levantó; ver qa/infra/logs/api-$SLOT.log y web-$SLOT.log" >&2
exit 1
