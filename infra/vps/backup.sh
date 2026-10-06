#!/bin/sh
# Copia diaria de la base de Mostrador; guarda las últimas 30.
set -eu
DIR=/opt/mostrador/backups
mkdir -p "$DIR"
docker compose -f /opt/mostrador/compose.yml exec -T postgres pg_dump -U mostrador -Fc mostrador > "$DIR/mostrador-$(date +%F).dump"
ls -1t "$DIR"/mostrador-*.dump | tail -n +31 | xargs -r rm -f
