# Dejar a Claude Code trabajando de noche

Claude Code corre en tu VPS, adentro de un contenedor: no ve yumi ni el resto del servidor, no publica puertos y tiene un tope de 4 GB de RAM y 2 CPU. Todo queda en commits locales: no hace push ni deploy.

## Una sola vez

1. Copiá el kit al VPS y armá el repo:

   ```bash
   scp mostrador-kit.zip emir@TU_VPS:~
   ssh emir@TU_VPS
   unzip mostrador-kit.zip && cd mostrador
   chmod +x agent/start.sh
   git init && git add -A && git commit -m "Spec y kit inicial"
   ```

2. Si el VPS no tiene Docker o tmux:

   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER   # después cerrá y volvé a abrir la sesión SSH
   sudo apt install -y tmux
   ```

3. Diseño: si ya tenés el paquete que exporta Claude Design, descomprimilo en `docs/design/` y hacé commit. Si todavía no lo tenés, arrancá igual: las primeras tareas (base, datos, permisos y sincronización) no lo necesitan. Cuando lo tengas, lo copiás ahí y Claude adapta las pantallas.

## Cada noche

1. Desde la carpeta del repo: `./agent/start.sh`. Levanta el contenedor y abre tmux con Claude Code adentro.
2. La primera vez, Claude te pide iniciar sesión: abrí el link que muestra, entrá con tu cuenta de Claude y pegá el código. Después confiá en la carpeta y aceptá el aviso del modo sin permisos (es seguro porque corre aislado).
3. Pegá el objetivo. Cambiá la fecha `05/10` si no es esta noche:

   ```text
   /goal Trabajá docs/PLAN.md en orden siguiendo CLAUDE.md: una tarea por vez, con tests, `bun run check` en verde, commit con el ID de la tarea, la tarea tildada en PLAN.md y una línea en docs/PROGRESS.md. Al final de cada turno mostrá el último commit (`git log --oneline -1`), el resultado de `bun run check`, cuántas tareas quedan (`grep -c '^- \[ \]' docs/PLAN.md`) y la fecha y hora (`TZ=America/Argentina/Buenos_Aires date '+%d/%m %H:%M'`). Si una tarea falla 3 veces, anotala en docs/BLOCKERS.md, marcala `- [~]` y seguí con la siguiente. No hagas push, no despliegues y no toques nada fuera de este repo. La meta se cumple cuando no quedan tareas `- [ ]` y `bun run check` sale con 0, o cuando la fecha y hora mostradas sean 05/10 08:00 o posteriores, o después de 300 turnos.
   ```

4. Salí de tmux sin cortarlo: `Ctrl+B` y después `D`. Ya podés cerrar la sesión SSH.

Si se alcanza el límite de uso de tu plan, Claude Code espera y sigue solo cuando se renueva, siempre que la sesión siga abierta. Por eso corre en tmux.

## A la mañana

```bash
cd ~/mostrador
tmux attach -t mostrador          # ver dónde quedó
git log --oneline | head -30
```

- `docs/PROGRESS.md`: qué hizo.
- `docs/BLOCKERS.md`: lo que necesita una decisión tuya.
- `docs/DECISIONS.md`: lo que decidió solo.

Para apagar todo: `docker compose -f agent/docker-compose.yml down`. La base de pruebas queda guardada en un volumen.
