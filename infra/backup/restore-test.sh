#!/bin/sh
# Una vez por mes: restaura la última copia en una base aparte y cuenta las ventas, para saber que sirve.
set -eu
WORK=/tmp/restore
rm -rf "$WORK" && mkdir -p "$WORK"
restic check --read-data-subset=5%
restic restore latest --tag nightly --target "$WORK" --include /tmp/backup/mostrador.dump
dropdb --if-exists mostrador_restore
createdb mostrador_restore
pg_restore --no-owner --dbname=mostrador_restore "$WORK/tmp/backup/mostrador.dump"
SALES=$(psql -d mostrador_restore -tAc "select count(*) from sales")
dropdb mostrador_restore
rm -rf "$WORK"
echo "{\"msg\":\"restore ok\",\"sales\":$SALES}"
[ -n "${BACKUP_PING_URL:-}" ] && curl -fsS -m 10 "$BACKUP_PING_URL" >/dev/null || true
