# Mostrador

Sistema de gestión para un almacén de un local: vender, caja, stock, compras, fiado y reportes. PWA para la Mac del mostrador (con pistola lectora USB) y para el iPhone de los dueños. Vende sin conexión y sincroniza cuando vuelve internet.

- Spec: `docs/spec.md` · Diseño: `docs/design/` · Plan: `docs/PLAN.md`
- Decisiones tomadas en el camino: `docs/DECISIONS.md` · Avance: `docs/PROGRESS.md`
- Despliegue en el VPS: `docs/DEPLOY.md`
- Reglas para Claude Code: `CLAUDE.md` · Correr Claude Code de noche: `docs/NOCHE.md`

## Stack

Monorepo con Bun workspaces: `apps/web` (React, Vite, Tailwind, TanStack Query, Dexie, PWA con Workbox), `apps/api` (Hono sobre Bun, Drizzle con PostgreSQL 16, Better Auth, pg-boss, Web Push, pdf-lib) y `packages/shared` (tipos, esquemas Zod, reglas de negocio y protocolo de sincronización).

## Levantar todo en desarrollo

Requisitos: Bun 1.4 y PostgreSQL 16 (o Docker para levantarlo).

```sh
bun install
cp .env.example .env                          # y completá lo que haga falta
docker compose -f docker-compose.dev.yml up -d  # Postgres 16 en localhost:5432 (si no tenés uno)
bun run db:migrate
bun run db:seed                               # el escenario de ejemplo: Almacén La Esquina
bun run dev                                   # API en :3000 y web en :5173
bun run --filter @mostrador/api worker        # opcional: avisos programados y push (pg-boss)
```

Entrá a http://localhost:5173:

- **Dueño:** "¿Primera vez? Creá la cuenta del dueño" con `carlos@laesquina.example` (el email del escenario) y la contraseña que quieras. Con la base vacía (sin `db:seed`), la primera cuenta es la del dueño y arranca la checklist de primeros pasos.
- **La Mac del mostrador:** Ajustes > Dispositivos > "Habilitar este dispositivo". Desde ahí se entra con PIN.
- **PIN del escenario:** Carlos 1234 (dueño), Julián 2345 (encargado), Lucía 3456 y Tomás 4567 (cajeros), Nico 5678 (repositor).

Para las notificaciones push hacen falta claves VAPID en `.env` (`bunx web-push generate-vapid-keys`); en el iPhone, la app tiene que estar agregada a la pantalla de inicio.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `bun run check` | Biome, typecheck de todo el monorepo y Vitest (unidad e integración). Tiene que salir con 0 |
| `bun run e2e` | Playwright contra el build de producción, con dos instalaciones: la del escenario y una vacía (primer uso). La primera vez: `bunx playwright install chromium` |
| `bun run db:migrate` · `bun run db:seed` | Migraciones y datos de ejemplo |
| `bun run fix` | Corrige formato y lint |

Las pruebas de integración usan `TEST_DATABASE_URL` (una base por archivo, copiada de una plantilla ya migrada). Los e2e crean sus bases `mostrador_e2e` y `mostrador_e2e_vacio`.

## Producción

Docker Compose en el VPS con `caddy`, `api`, `worker`, `postgres` y `backup` (pg_dump + restic). Todo está en `infra/` y paso a paso en `docs/DEPLOY.md`. Nada se despliega solo.

## Pendientes

Lo que quedó fuera de v1 o a medias, para la próxima vuelta:

- **Fase 2 (fuera de alcance a propósito):** el bot de WhatsApp (hoy los pedidos salen con un enlace wa.me con el pedido escrito) y la factura electrónica de ARCA (hoy, pantalla "Próximamente"; la condición fiscal y el IVA por producto ya se cargan).
- **Imágenes de Docker sin probar:** los Dockerfiles y el compose se validan con tests, pero en el contenedor de trabajo no hay Docker; falta un `docker build` real y un CI que publique las imágenes.
- **Reportes:** exportan a Excel y CSV; falta PDF y "compartir". Tocar una fila baja de categoría a producto, pero no de producto a sus ventas.
- **Clientes:** el estado de cuenta se comparte como texto (WhatsApp) y PDF; falta como imagen. La lista de clientes y la ficha necesitan conexión (vender y cobrar fiado andan sin internet).
- **Conteos y recepción con pedido** necesitan conexión para empezar (la recepción sin pedido y lo que se confirma quedan en cola).
- **Usuarios:** no hay envío de invitaciones por mail ni SMS: el dueño carga a la persona y el encargado crea su cuenta con ese email desde el ingreso.
- **Ajustes:** falta subir el logo del negocio y del ticket; la balanza conectada queda para más adelante.
- **Pedido fijo:** se crea y arma el borrador del día, pero todavía no se edita ni se borra desde la pantalla.
- **Avisos por WhatsApp** (canal de la matriz) llegan con el bot, en la fase 2.
