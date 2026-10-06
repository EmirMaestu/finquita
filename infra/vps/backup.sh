#!/bin/sh
# Copia diaria de la base de Mostrador; guarda las últimas 30.
# Se escribe en un temporal y se renombra solo si pg_dump terminó bien: así una copia
# cortada nunca aparece como la última en el panel. Solo la lee emir (uid 1000, el mismo
# usuario que corre la API en el contenedor).
set -eu
umask 077
DIR=/opt/mostrador/backups
mkdir -p "$DIR"
FINAL="$DIR/mostrador-$(date +%F).dump"
TMP="$DIR/.mostrador-$(date +%F).dump.tmp"
trap 'rm -f "$TMP"' EXIT
docker compose -f /opt/mostrador/compose.yml exec -T postgres pg_dump -U mostrador -Fc mostrador > "$TMP"
[ -s "$TMP" ] || { echo "pg_dump dejó un archivo vacío" >&2; exit 1; }
mv "$TMP" "$FINAL"
ls -1t "$DIR"/mostrador-*.dump | tail -n +31 | xargs -r rm -f
