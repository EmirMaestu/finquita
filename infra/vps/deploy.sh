#!/usr/bin/env bash
# Deploy de Mostrador al VPS compartido (finquita.emir-maestu.com), desde la PC.
#   bash infra/vps/deploy.sh
# Sube el código del commit actual, reconstruye la API y cambia la web de golpe.
set -euo pipefail
cd "$(dirname "$0")/../.."
HOST=emir@217.76.48.219
TAG="$(git rev-parse --short HEAD)"
[ -z "$(git status --porcelain)" ] || { echo "Hay cambios sin commitear"; exit 1; }

TMP="$(mktemp -d)"
git archive --format=tar.gz -o "$TMP/src.tar.gz" HEAD
(cd apps/web && bunx vite build)
tar --force-local -czf "$TMP/web.tar.gz" -C apps/web/dist .

ssh "$HOST" 'rm -rf /tmp/mostrador-up && mkdir -p /tmp/mostrador-up'
scp -q "$TMP/src.tar.gz" "$TMP/web.tar.gz" infra/vps/compose.yml infra/vps/backup.sh \
  "$HOST:/tmp/mostrador-up/"
ssh "$HOST" "TAG=$TAG bash -s" <<'REMOTE'
set -euo pipefail
cd /opt/mostrador
rm -rf src && mkdir src && tar -xzf /tmp/mostrador-up/src.tar.gz -C src
cp /tmp/mostrador-up/compose.yml /tmp/mostrador-up/backup.sh . && chmod +x backup.sh
sed -i '/^APP_VERSION=/d' .env && echo "APP_VERSION=$TAG" >> .env
docker compose up -d --build
for i in $(seq 1 30); do curl -sf -m 3 http://127.0.0.1:3100/api/health >/dev/null && break; sleep 2; done
curl -sf -m 3 http://127.0.0.1:3100/api/health
sudo rm -rf /var/www/mostrador.new && sudo mkdir -p /var/www/mostrador.new
sudo tar -xzf /tmp/mostrador-up/web.tar.gz -C /var/www/mostrador.new
sudo chmod -R a+rX /var/www/mostrador.new
sudo rm -rf /var/www/mostrador.old
[ -d /var/www/mostrador ] && sudo mv /var/www/mostrador /var/www/mostrador.old
sudo mv /var/www/mostrador.new /var/www/mostrador
rm -rf /tmp/mostrador-up
echo "Listo: https://finquita.emir-maestu.com (versión $TAG)"
REMOTE
rm -rf "$TMP"
