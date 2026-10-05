# Plan de construcción — Mostrador v1

Una tarea por vez, en orden. `- [ ]` pendiente · `- [x]` hecha · `- [~]` trabada (ver `BLOCKERS.md`).
Cada tarea dice qué secciones del spec leer (§) y cuándo está lista. Las tareas de pantallas siguen `docs/design/` si existe.

## Hito 0 · Base del repo

- [x] T01 · **Monorepo y herramientas.** Bun workspaces con `apps/web`, `apps/api` y `packages/shared`; TypeScript estricto; Biome; Vitest; scripts `dev`, `check`, `test`, `e2e`, `db:migrate` y `db:seed` en el `package.json` raíz; `.gitignore` y `.env.example`. §Arquitectura técnica.
  Listo cuando: `bun install` y `bun run check` salen con 0, con un test de ejemplo en cada paquete.
- [x] T02 · **Base de datos y migraciones.** Drizzle con PostgreSQL vía `DATABASE_URL`; carpeta de migraciones; `docker-compose.dev.yml` con Postgres 16 para desarrollar fuera del contenedor. §Arquitectura técnica.
  Listo cuando: `bun run db:migrate` funciona sobre una base vacía y un test de integración se conecta.
- [x] T03 · **API base.** Hono en Bun: `/api/health`, manejo de errores, logs JSON, validación con Zod. §Arquitectura técnica.
  Listo cuando: el test de `/api/health` pasa.
- [x] T04 · **App base.** React, Vite, Tailwind; tokens del sistema de diseño como variables CSS con tema claro y oscuro; React Router; barra inferior en iPhone y barra lateral en Mac; proxy de `/api` en desarrollo. §Sistema de diseño · §Navegación.
  Listo cuando: el build no tiene errores y hay un test de render del layout en los dos tamaños.
- [x] T05 · **PWA.** vite-plugin-pwa: manifest (nombre provisorio Mostrador, íconos de prueba), service worker que precachea la app, aviso "Hay una versión nueva" que nunca interrumpe una venta, guía de instalación para iPhone. §Arquitectura técnica (PWA).
  Listo cuando: el build genera manifest y service worker, y el componente del aviso tiene test.

## Hito 1 · Datos, usuarios y permisos

- [x] T06 · **Esquema núcleo.** Negocio, usuarios, roles y permisos, dispositivos, categorías, productos, códigos de barras, presentaciones vinculadas, proveedores y sus productos, movimientos de stock, lotes, cajas, turnos, movimientos de caja, ventas, líneas, pagos, clientes, cuenta corriente, pedidos y líneas, recepciones, facturas y pagos a proveedores, promociones, avisos, ajustes, auditoría y operaciones de sincronización. Plata en centavos, cantidades `numeric(12,3)`, IDs UUIDv7. §Productos y stock · §Caja · §Clientes y fiado · §Proveedores y compras · §Ventas sin conexión.
  Listo cuando: la migración se aplica y hay tests de las restricciones clave (código de barras único, `op_id` único).
- [x] T07 · **Datos de ejemplo.** `db:seed` carga el escenario de §Datos de ejemplo: Almacén La Esquina, equipo, productos con costo y precio, proveedores, clientes con fiado y pedido 0042.
  Listo cuando: el seed corre dos veces sin duplicar y un test verifica saldos de fiado ($ 73.800 en la calle, $ 46.800 vencidos) y el total del pedido 0042 ($ 186.400).
- [ ] T08 · **Autenticación.** Better Auth con email y contraseña para dueño y encargado; PIN de 4 a 6 dígitos con argon2 y bloqueo de 5 minutos tras 5 intentos; dispositivos habilitados por el dueño; cambio rápido de usuario con PIN. §Usuarios y permisos.
  Listo cuando: hay tests de login, PIN correcto, PIN incorrecto y bloqueo.
- [ ] T09 · **Permisos en la API.** Middleware que aplica la matriz, con autorización por PIN para las acciones marcadas así y ajustes por persona. §Usuarios y permisos.
  Listo cuando: hay tests por rol de al menos 8 acciones de la matriz.
- [ ] T10 · **Auditoría.** Registro de cambios sensibles (quién, dispositivo, cuándo, valor anterior y nuevo) y endpoint de lectura con filtros. §Requisitos transversales.
  Listo cuando: el helper y el endpoint tienen tests.

## Hito 2 · Motor sin conexión

- [ ] T11 · **Protocolo de sincronización** en `packages/shared`: tipos de operación (`sale.create`, `cash.movement`, `stock.adjust`, `product.upsert`, etc.), esquemas Zod y reglas de conflicto. §Ventas sin conexión.
  Listo cuando: hay tests de validación de cada tipo de operación.
- [ ] T12 · **`POST /api/sync/push`.** Aplica las operaciones en transacción, idempotente por `op_id`, con respuesta por operación (aplicada o rechazada con motivo); lo rechazado va a Avisos.
  Listo cuando: hay tests de operación duplicada, orden y rechazo.
- [ ] T13 · **`GET /api/sync/pull?since=`.** Cursor por secuencia; cambios y bajas de las entidades que necesita cada dispositivo.
  Listo cuando: hay tests de cursor y de bajas.
- [ ] T14 · **Cliente de sincronización en la web.** Dexie con catálogo, clientes, caja y cola; aplicación optimista; envío por lotes de hasta 100; disparadores (inicio, cada 20 s, al volver internet, después de cada venta, aviso por SSE); chip "Sin conexión · N ventas por sincronizar". §Requisitos transversales.
  Listo cuando: la cola tiene tests unitarios.
- [ ] T15 · **SSE `/api/events`** que avisa a los dispositivos que hay cambios.
  Listo cuando: un test verifica que un push dispara el evento.
- [ ] T16 · **Conflictos.** Los seis casos de §Ventas sin conexión como tests de integración: última unidad en dos dispositivos, precio cambiado sin conexión, edición concurrente, fiado sobre el límite, código repetido y cierre de turno sin conexión.
  Listo cuando: los seis pasan.

## Hito 3 · Catálogo

- [ ] T17 · **API de catálogo:** productos, códigos, categorías, presentaciones vinculadas, precio fijo, servicios a comisión y envases retornables. §Productos y stock.
  Listo cuando: el CRUD tiene tests y respeta permisos.
- [ ] T18 · **Lista y ficha de producto.** Tabla en Mac, tarjetas en iPhone, filtros y selección múltiple; ficha con pestañas. §Productos y stock.
  Listo cuando: un e2e crea y edita un producto.
- [ ] T19 · **Lectores.** Hook que reconoce la pistola por velocidad de tipeo en cualquier pantalla de Vender; escáner por cámara con @zxing/browser; pitido y aviso en pantalla. §Requisitos transversales.
  Listo cuando: el hook tiene tests con eventos de teclado simulados.
- [ ] T20 · **Alta rápida y Modo carga.** Código desconocido → nombre y precio en diez segundos; Modo carga en serie con pistola o cámara. Open Food Facts a través de la API: User-Agent propio, caché y límite de 15 consultas por minuto. §Productos y stock.
  Listo cuando: el proxy tiene tests con fetch simulado y hay un e2e del Modo carga.
- [ ] T21 · **Importar productos** desde Excel o CSV con asistente: relacionar columnas, vista previa (nuevos, actualizados, con error) y confirmar.
  Listo cuando: un test importa un archivo de ejemplo.
- [ ] T22 · **Planilla de códigos y etiquetas de góndola.** Página imprimible o PDF en A4; códigos internos que empiezan con 2 para lo que no tiene código de barras. §Productos y stock.
  Listo cuando: un test genera la planilla con los productos sin código.

## Hito 4 · Vender y caja

- [ ] T23 · **Caja: abrir turno, turno en curso y movimientos** (retiro, gasto, ingreso, pago a proveedor) con motivo y PIN. §Caja.
  Listo cuando: un test calcula el efectivo esperado del ejemplo del spec ($ 121.900).
- [ ] T24 · **Vender en modo simple** para Mac e iPhone: lista, botones rápidos y Cobrar; atajos de teclado; ventas en espera. §Vender · §Navegación.
  Listo cuando: un e2e vende 4 productos usando solo el teclado.
- [ ] T25 · **Pesables:** teclado de peso con atajos de 100 g, ¼ kg y ½ kg, y modo por plata. §Vender.
  Listo cuando: los tests dan 0,750 kg × $ 3.800 = $ 2.850 y "$ 2.000 de queso" a $ 13.500/kg = cortar 148 g.
- [ ] T26 · **Cobro:** Efectivo, Tarjeta, Transferencia o QR (con "Verificada") y Fiado (con límite); pago combinado y vuelto. §Vender.
  Listo cuando: un e2e reproduce el flujo 1 de §Flujos clave (total $ 18.550, vuelto $ 1.450).
- [ ] T27 · **Ticket** de 58 y 80 mm con la impresión del navegador, y Compartir como PDF. §Vender · §Datos de ejemplo.
  Listo cuando: hay un snapshot del ticket de ejemplo.
- [ ] T28 · **Historial, devoluciones y anulaciones** con PIN; lo devuelto vuelve a la góndola o va a merma. §Vender.
  Listo cuando: hay tests de las dos salidas del stock.
- [ ] T29 · **Venta sin conexión de punta a punta.** e2e con Playwright: cortar la red, vender 3 veces, reconectar.
  Listo cuando: las 3 ventas quedan en el servidor una sola vez.
- [ ] T30 · **Arqueo ciego y cierre:** conteo por denominación, otros medios, tolerancia con comentario obligatorio, comprobante e historial. §Caja.
  Listo cuando: un test con $ 120.700 contados da una diferencia de −$ 1.200.

## Hito 5 · Stock

- [ ] T31 · **Movimientos y ajustes de stock** con motivo; los del repositor quedan para aprobar. §Productos y stock.
  Listo cuando: hay tests del libro de movimientos y de la aprobación.
- [ ] T32 · **Cambio masivo de precios** con vista previa y redondeo; los de precio fijo quedan afuera.
  Listo cuando: un test aplica +7 % a una categoría.
- [ ] T33 · **Conteo de inventario:** modo iPhone ciego y revisión en Mac.
  Listo cuando: un e2e completa un conteo chico.
- [ ] T34 · **Vencimientos, lotes y promociones** (2×1, 3×2, enésima unidad, combo, % por categoría, día de la semana). Arrancan apagados (modo simple).
  Listo cuando: cada tipo de promoción tiene su test en el carrito.

## Hito 6 · Compras

- [ ] T35 · **Proveedores:** ficha, condiciones, WhatsApp, productos con código y costo. §Proveedores y compras.
  Listo cuando: el CRUD tiene tests.
- [ ] T36 · **Pedido sugerido** con la fórmula del spec y su explicación en palabras.
  Listo cuando: el test da 24 unidades (2 cajas de 12) para 3 por día, 11 días a cubrir y stock 9.
- [ ] T37 · **Pedidos:** estados marcados a mano, PDF del pedido con pdf-lib, botón "Enviar por WhatsApp" (enlace wa.me con el pedido escrito) y pedido fijo. El bot es fase 2.
  Listo cuando: hay tests del texto del mensaje y del enlace.
- [ ] T38 · **Recepción en iPhone,** con o sin pedido: faltantes, lotes, foto del remito y aviso de costo que cambió (el repositor no ve costos).
  Listo cuando: un e2e recibe el pedido 0042.
- [ ] T39 · **Facturas y pagos a proveedores** (pagar desde la caja crea el movimiento) y **lista de precios** del proveedor (Excel, IVA y bonificación).
  Listo cuando: hay tests del saldo por proveedor.

## Hito 7 · Clientes y fiado

- [ ] T40 · **Clientes y cuenta corriente:** límites, plazo, cobro que cancela lo más viejo y estado de cuenta para compartir. §Clientes y fiado.
  Listo cuando: el test del flujo 6 da $ 18.400 → $ 25.100 → $ 5.100.

## Hito 8 · Inicio, avisos y reportes

- [ ] T41 · **Avisos** en la app y Web Push (VAPID), con matriz por tipo y rol. §Requisitos transversales · §Ajustes.
  Listo cuando: hay tests de stock bajo, diferencia de caja y pedido sin confirmar en 24 h.
- [ ] T42 · **Inicio:** panel del día con números, "Requiere atención", accesos y gráficos; variantes por rol. §Inicio.
  Listo cuando: un test con ventas conocidas verifica los números del panel.
- [ ] T43 · **Reportes:** las siete preguntas de §Reportes, con período, comparación y exportar a Excel o CSV.
  Listo cuando: hay tests de margen y de resultado del mes.

## Hito 9 · Ajustes y primeros pasos

- [ ] T44 · **Ajustes:** todas las secciones de §Ajustes, incluidas la pantalla "Próximamente" de facturación y Funciones (modo simple).
  Listo cuando: un e2e cambia un medio de pago y el cambio se ve en el cobro.
- [ ] T45 · **Primeros pasos:** checklist de §Inicio y flujo 8 de §Flujos clave.
  Listo cuando: un e2e va desde la base vacía hasta la primera venta.

## Hito 10 · Listo para desplegar (sin desplegar)

- [ ] T46 · **Infraestructura de producción:** Dockerfiles de api y web, `infra/docker-compose.prod.yml` (caddy, api, worker, postgres, backup), `infra/Caddyfile` con el subdominio tomado de `.env`, backup con pg_dump y restic, y `docs/DEPLOY.md`. §Arquitectura técnica. No ejecutar nada contra el VPS.
  Listo cuando: un test valida el YAML del compose.
- [ ] T47 · **Repaso final:** `bun run check` y `bun run e2e` en verde; README con cómo levantar todo y la lista de pendientes.
  Listo cuando: los dos comandos salen con 0.
