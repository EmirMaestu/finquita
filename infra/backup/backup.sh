#!/bin/sh
# pg_dump + fotos → restic (cifrado) en el bucket externo. Guarda 7 diarias, 4 semanales y 12 mensuales.
set -eu
STAMP=$(date +%Y-%m-%d_%H%M)
WORK=/tmp/backup
mkdir -p "$WORK"

ping() { [ -n "${BACKUP_PING_URL:-}" ] && curl -fsS -m 10 "$BACKUP_PING_URL$1" >/dev/null || true; }
trap 'ping /fail' EXIT

ping /start
restic snapshots >/dev/null 2>&1 || restic init
pg_dump --format=custom --no-owner --file="$WORK/mostrador.dump"
restic backup --tag nightly --host mostrador "$WORK/mostrador.dump" /data/files
restic forget --tag nightly --keep-daily 7 --keep-weekly 4 --keep-monthly 12 --prune
rm -f "$WORK/mostrador.dump"
echo "{\"msg\":\"backup ok\",\"at\":\"$STAMP\"}"

trap - EXIT
ping ""
