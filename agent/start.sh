#!/usr/bin/env bash
# Levanta el contenedor del agente y abre (o retoma) una sesión de tmux con Claude Code adentro.
# Uso: ./agent/start.sh   ·   Salir sin cortar: Ctrl+B y después D   ·   Volver: tmux attach -t mostrador
set -euo pipefail

cd "$(dirname "$0")"

command -v docker >/dev/null || { echo "Falta Docker: curl -fsSL https://get.docker.com | sh"; exit 1; }
command -v tmux >/dev/null || { echo "Falta tmux: sudo apt install -y tmux"; exit 1; }

export HOST_UID HOST_GID
HOST_UID="$(id -u)"
HOST_GID="$(id -g)"

docker compose up -d --build

SESSION="mostrador"
if ! tmux has-session -t "$SESSION" 2>/dev/null; then
  tmux new-session -d -s "$SESSION" -c "$PWD" \
    "docker compose exec agent claude --dangerously-skip-permissions; exec bash"
fi
exec tmux attach -t "$SESSION"
