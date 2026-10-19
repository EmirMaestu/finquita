#!/bin/sh
# Baja los servidores de un slot (o de todos, sin argumento) levantados por up.sh.
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"
for f in qa/infra/run/*.pid; do
  [ -f "$f" ] || continue
  n=$(basename "$f" .pid)
  case "$n" in *-"${1:-}"|*) ;; esac
  if [ -n "${1:-}" ] && [ "${n#*-}" != "$1" ]; then continue; fi
  pid=$(cat "$f")
  kill -- -"$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
  rm -f "$f"
  echo "bajado $n"
done
