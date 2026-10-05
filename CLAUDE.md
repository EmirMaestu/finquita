# Mostrador — guía para Claude Code

Sistema de gestión para un almacén de un solo local: vender, caja, stock, compras, fiado y reportes. Es una PWA que se usa en una Mac (mostrador, con pistola lectora USB) y en iPhone (dueños).

- **Spec completo:** `docs/spec.md`. Es la fuente de verdad del comportamiento y las reglas de negocio.
- **Diseño:** `docs/design/` (paquete de Claude Design). Manda en lo visual. Si solo tiene su README, usá la sección "Sistema de diseño" del spec; cuando llegue el paquete, adaptá las pantallas ya hechas.
- **Plan:** `docs/PLAN.md`, tarea por tarea.

## Cómo trabajar (sesión sin supervisión)

1. Leé `docs/PLAN.md` y tomá la primera tarea `- [ ]` en orden. Si una `- [~]` ya se puede destrabar, retomala.
2. Antes de programar, releé las secciones del spec que la tarea indica con §.
3. Implementá lo mínimo que cumpla el "Listo cuando", con tests.
4. Corré `bun run check`. Si falla, arreglalo antes de seguir. Nunca dejes `check` en rojo al terminar una tarea.
5. Commit en español con el ID de la tarea: `T07: datos de ejemplo del escenario`. Como mínimo, un commit por tarea.
6. Tildá la tarea (`- [x]`) en `docs/PLAN.md` y agregá una línea en `docs/PROGRESS.md`.
7. Si después de 3 intentos una tarea no sale: anotá en `docs/BLOCKERS.md` qué probaste y qué falta, marcala `- [~]` y seguí con la siguiente que no dependa de ella.
8. Nunca esperes respuesta de una persona. Si hay que decidir algo que el spec no define, elegí lo más simple que lo respete y anotalo en `docs/DECISIONS.md`.
9. Después de una compactación de contexto, releé este archivo, `docs/PLAN.md` y las últimas 20 líneas de `docs/PROGRESS.md`.

## Reglas duras

- No hagas `git push`, deploy, `ssh` ni `scp`. Todo queda en commits locales.
- No reescribas historia de git: nada de `reset --hard`, `rebase` ni `push --force`.
- No modifiques `CLAUDE.md`, `.claude/`, `agent/` ni `docs/spec.md`.
- El bot de WhatsApp y la factura electrónica ARCA son fase 2: no los construyas. Solo dejá lo que el spec dice que "queda listo en v1" (por ejemplo, el envío de pedidos por enlace wa.me).
- Sin secretos en el repo: `.env` ignorado por git; `.env.example` con valores de ejemplo.
- No cambies el stack ni sumes dependencias pesadas sin necesidad.

## Stack (no se cambia)

- Monorepo con Bun workspaces: `apps/web`, `apps/api`, `packages/shared`.
- **Web (PWA):** React, Vite, TypeScript, Tailwind CSS, React Router, TanStack Query, Dexie (IndexedDB), vite-plugin-pwa (Workbox), @zxing/browser. Build target ES2020.
- **API:** Hono sobre Bun, Zod, Drizzle ORM con PostgreSQL 16, Better Auth (email y contraseña, sesiones en Postgres), pg-boss, Server-Sent Events, web-push (VAPID), pdf-lib.
- **Compartido:** tipos, esquemas Zod, reglas de negocio (totales, promociones, pesables, pedido sugerido) y protocolo de sincronización en `packages/shared`.
- **Calidad:** Biome (lint y formato), Vitest (unidad e integración), Playwright (e2e, incluido sin conexión).

## Comandos

Los crea T01 y se mantienen siempre funcionando:

- `bun install`
- `bun run dev`: API y web en desarrollo.
- `bun run check`: Biome, typecheck de todo el monorepo y Vitest. Tiene que salir con código 0.
- `bun run e2e`: Playwright.
- `bun run db:migrate` y `bun run db:seed`.

La base de datos está en `DATABASE_URL`. Dentro del contenedor de `agent/` apunta al servicio `db` (Postgres 16). Para pruebas de integración, usá una base o un esquema aparte y limpialo en cada test.

## Convenciones

- TypeScript estricto. Plata en centavos (enteros). Cantidades con 3 decimales (pesables).
- Todo lo que se sincroniza usa IDs UUIDv7 generados en el cliente.
- Stock, caja y fiado son libros de movimientos que solo crecen (spec § "Ventas sin conexión").
- La API valida cada permiso de la matriz (spec § "Usuarios y permisos"); la UI solo oculta.
- UI en español rioplatense con voseo. Formatos argentinos: `$ 12.345,50`, `dd/mm/aaaa`, hora de 24 h, `0,350 kg`.
- Cada pantalla tiene versión iPhone (393 px) y Mac (1280 px), y sus estados: cargando, vacío, error, sin conexión y sin permiso.
- Arranca en modo simple: promociones, lotes, conteos y varias cajas apagados por defecto (Ajustes > Funciones).
- Commits en español, con el ID de la tarea al principio.

## Mapa del spec (`docs/spec.md`)

- Resumen y decisiones · Usuarios y permisos · Navegación · Requisitos transversales
- Módulos: Inicio · Vender · Caja · Productos y stock · Proveedores y compras · Bot de WhatsApp (fase 2) · Clientes y fiado · Reportes · Ajustes
- Flujos clave · Sistema de diseño · Datos de ejemplo (escenario para seed y tests)
- Arquitectura técnica · Ventas sin conexión · Cómo construirlo con Claude Code · Fase 2
