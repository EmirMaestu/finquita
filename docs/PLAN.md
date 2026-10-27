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
- [x] T08 · **Autenticación.** Better Auth con email y contraseña para dueño y encargado; PIN de 4 a 6 dígitos con argon2 y bloqueo de 5 minutos tras 5 intentos; dispositivos habilitados por el dueño; cambio rápido de usuario con PIN. §Usuarios y permisos.
  Listo cuando: hay tests de login, PIN correcto, PIN incorrecto y bloqueo.
- [x] T09 · **Permisos en la API.** Middleware que aplica la matriz, con autorización por PIN para las acciones marcadas así y ajustes por persona. §Usuarios y permisos.
  Listo cuando: hay tests por rol de al menos 8 acciones de la matriz.
- [x] T10 · **Auditoría.** Registro de cambios sensibles (quién, dispositivo, cuándo, valor anterior y nuevo) y endpoint de lectura con filtros. §Requisitos transversales.
  Listo cuando: el helper y el endpoint tienen tests.

## Hito 2 · Motor sin conexión

- [x] T11 · **Protocolo de sincronización** en `packages/shared`: tipos de operación (`sale.create`, `cash.movement`, `stock.adjust`, `product.upsert`, etc.), esquemas Zod y reglas de conflicto. §Ventas sin conexión.
  Listo cuando: hay tests de validación de cada tipo de operación.
- [x] T12 · **`POST /api/sync/push`.** Aplica las operaciones en transacción, idempotente por `op_id`, con respuesta por operación (aplicada o rechazada con motivo); lo rechazado va a Avisos.
  Listo cuando: hay tests de operación duplicada, orden y rechazo.
- [x] T13 · **`GET /api/sync/pull?since=`.** Cursor por secuencia; cambios y bajas de las entidades que necesita cada dispositivo.
  Listo cuando: hay tests de cursor y de bajas.
- [x] T14 · **Cliente de sincronización en la web.** Dexie con catálogo, clientes, caja y cola; aplicación optimista; envío por lotes de hasta 100; disparadores (inicio, cada 20 s, al volver internet, después de cada venta, aviso por SSE); chip "Sin conexión · N ventas por sincronizar". §Requisitos transversales.
  Listo cuando: la cola tiene tests unitarios.
- [x] T15 · **SSE `/api/events`** que avisa a los dispositivos que hay cambios.
  Listo cuando: un test verifica que un push dispara el evento.
- [x] T16 · **Conflictos.** Los seis casos de §Ventas sin conexión como tests de integración: última unidad en dos dispositivos, precio cambiado sin conexión, edición concurrente, fiado sobre el límite, código repetido y cierre de turno sin conexión.
  Listo cuando: los seis pasan.

## Hito 3 · Catálogo

- [x] T17 · **API de catálogo:** productos, códigos, categorías, presentaciones vinculadas, precio fijo, servicios a comisión y envases retornables. §Productos y stock.
  Listo cuando: el CRUD tiene tests y respeta permisos.
- [x] T18 · **Lista y ficha de producto.** Tabla en Mac, tarjetas en iPhone, filtros y selección múltiple; ficha con pestañas. §Productos y stock.
  Listo cuando: un e2e crea y edita un producto.
- [x] T19 · **Lectores.** Hook que reconoce la pistola por velocidad de tipeo en cualquier pantalla de Vender; escáner por cámara con @zxing/browser; pitido y aviso en pantalla. §Requisitos transversales.
  Listo cuando: el hook tiene tests con eventos de teclado simulados.
- [x] T20 · **Alta rápida y Modo carga.** Código desconocido → nombre y precio en diez segundos; Modo carga en serie con pistola o cámara. Open Food Facts a través de la API: User-Agent propio, caché y límite de 15 consultas por minuto. §Productos y stock.
  Listo cuando: el proxy tiene tests con fetch simulado y hay un e2e del Modo carga.
- [x] T21 · **Importar productos** desde Excel o CSV con asistente: relacionar columnas, vista previa (nuevos, actualizados, con error) y confirmar.
  Listo cuando: un test importa un archivo de ejemplo.
- [x] T22 · **Planilla de códigos y etiquetas de góndola.** Página imprimible o PDF en A4; códigos internos que empiezan con 2 para lo que no tiene código de barras. §Productos y stock.
  Listo cuando: un test genera la planilla con los productos sin código.

## Hito 4 · Vender y caja

- [x] T23 · **Caja: abrir turno, turno en curso y movimientos** (retiro, gasto, ingreso, pago a proveedor) con motivo y PIN. §Caja.
  Listo cuando: un test calcula el efectivo esperado del ejemplo del spec ($ 121.900).
- [x] T24 · **Vender en modo simple** para Mac e iPhone: lista, botones rápidos y Cobrar; atajos de teclado; ventas en espera. §Vender · §Navegación.
  Listo cuando: un e2e vende 4 productos usando solo el teclado.
- [x] T25 · **Pesables:** teclado de peso con atajos de 100 g, ¼ kg y ½ kg, y modo por plata. §Vender.
  Listo cuando: los tests dan 0,750 kg × $ 3.800 = $ 2.850 y "$ 2.000 de queso" a $ 13.500/kg = cortar 148 g.
- [x] T26 · **Cobro:** Efectivo, Tarjeta, Transferencia o QR (con "Verificada") y Fiado (con límite); pago combinado y vuelto. §Vender.
  Listo cuando: un e2e reproduce el flujo 1 de §Flujos clave (total $ 18.550, vuelto $ 1.450).
- [x] T27 · **Ticket** de 58 y 80 mm con la impresión del navegador, y Compartir como PDF. §Vender · §Datos de ejemplo.
  Listo cuando: hay un snapshot del ticket de ejemplo.
- [x] T28 · **Historial, devoluciones y anulaciones** con PIN; lo devuelto vuelve a la góndola o va a merma. §Vender.
  Listo cuando: hay tests de las dos salidas del stock.
- [x] T29 · **Venta sin conexión de punta a punta.** e2e con Playwright: cortar la red, vender 3 veces, reconectar.
  Listo cuando: las 3 ventas quedan en el servidor una sola vez.
- [x] T30 · **Arqueo ciego y cierre:** conteo por denominación, otros medios, tolerancia con comentario obligatorio, comprobante e historial. §Caja.
  Listo cuando: un test con $ 120.700 contados da una diferencia de −$ 1.200.

## Hito 5 · Stock

- [x] T31 · **Movimientos y ajustes de stock** con motivo; los del repositor quedan para aprobar. §Productos y stock.
  Listo cuando: hay tests del libro de movimientos y de la aprobación.
- [x] T32 · **Cambio masivo de precios** con vista previa y redondeo; los de precio fijo quedan afuera.
  Listo cuando: un test aplica +7 % a una categoría.
- [x] T33 · **Conteo de inventario:** modo iPhone ciego y revisión en Mac.
  Listo cuando: un e2e completa un conteo chico.
- [x] T34 · **Vencimientos, lotes y promociones** (2×1, 3×2, enésima unidad, combo, % por categoría, día de la semana). Arrancan apagados (modo simple).
  Listo cuando: cada tipo de promoción tiene su test en el carrito.

## Hito 6 · Compras

- [x] T35 · **Proveedores:** ficha, condiciones, WhatsApp, productos con código y costo. §Proveedores y compras.
  Listo cuando: el CRUD tiene tests.
- [x] T36 · **Pedido sugerido** con la fórmula del spec y su explicación en palabras.
  Listo cuando: el test da 24 unidades (2 cajas de 12) para 3 por día, 11 días a cubrir y stock 9.
- [x] T37 · **Pedidos:** estados marcados a mano, PDF del pedido con pdf-lib, botón "Enviar por WhatsApp" (enlace wa.me con el pedido escrito) y pedido fijo. El bot es fase 2.
  Listo cuando: hay tests del texto del mensaje y del enlace.
- [x] T38 · **Recepción en iPhone,** con o sin pedido: faltantes, lotes, foto del remito y aviso de costo que cambió (el repositor no ve costos).
  Listo cuando: un e2e recibe el pedido 0042.
- [x] T39 · **Facturas y pagos a proveedores** (pagar desde la caja crea el movimiento) y **lista de precios** del proveedor (Excel, IVA y bonificación).
  Listo cuando: hay tests del saldo por proveedor.

## Hito 7 · Clientes y fiado

- [x] T40 · **Clientes y cuenta corriente:** límites, plazo, cobro que cancela lo más viejo y estado de cuenta para compartir. §Clientes y fiado.
  Listo cuando: el test del flujo 6 da $ 18.400 → $ 25.100 → $ 5.100.

## Hito 8 · Inicio, avisos y reportes

- [x] T41 · **Avisos** en la app y Web Push (VAPID), con matriz por tipo y rol. §Requisitos transversales · §Ajustes.
  Listo cuando: hay tests de stock bajo, diferencia de caja y pedido sin confirmar en 24 h.
- [x] T42 · **Inicio:** panel del día con números, "Requiere atención", accesos y gráficos; variantes por rol. §Inicio.
  Listo cuando: un test con ventas conocidas verifica los números del panel.
- [x] T43 · **Reportes:** las siete preguntas de §Reportes, con período, comparación y exportar a Excel o CSV.
  Listo cuando: hay tests de margen y de resultado del mes.

## Hito 9 · Ajustes y primeros pasos

- [x] T44 · **Ajustes:** todas las secciones de §Ajustes, incluidas la pantalla "Próximamente" de facturación y Funciones (modo simple).
  Listo cuando: un e2e cambia un medio de pago y el cambio se ve en el cobro.
- [x] T45 · **Primeros pasos:** checklist de §Inicio y flujo 8 de §Flujos clave.
  Listo cuando: un e2e va desde la base vacía hasta la primera venta.

## Hito 10 · Listo para desplegar (sin desplegar)

- [x] T46 · **Infraestructura de producción:** Dockerfiles de api y web, `infra/docker-compose.prod.yml` (caddy, api, worker, postgres, backup), `infra/Caddyfile` con el subdominio tomado de `.env`, backup con pg_dump y restic, y `docs/DEPLOY.md`. §Arquitectura técnica. No ejecutar nada contra el VPS.
  Listo cuando: un test valida el YAML del compose.
- [x] T47 · **Repaso final:** `bun run check` y `bun run e2e` en verde; README con cómo levantar todo y la lista de pendientes.
  Listo cuando: los dos comandos salen con 0.

## Hito QA · QA con usuarios

Cinco usuarios nuevos recorrieron la app (docs/QA-USUARIOS.md). Las tareas agrupan los hallazgos por pantalla o por causa y llevan los Q que cierran. Cada arreglo lleva su test (un e2e que reproduzca el problema siempre que se pueda). Lo que contradiga el spec o el diseño no se toca: va a BLOCKERS.md.

- [x] T48 · **Vender con teclado (Mac).** Enter sobre un medio de pago enfocado elige ese medio (no confirma en efectivo) y la franja muestra una tecla por medio; F3 funciona dentro de "El código no está cargado"; la tecla que cierra la pantalla verde llega a la venta nueva ("2*" sobre la pantalla verde multiplica); "Verificada en el banco" con tecla; F5 funciona dentro del cobro; Enter agrega pago y Ctrl+Enter confirma, dicho en pantalla; "¿Vender igual?" con teclas; Varios con monto inválido avisa. §Navegación (atajos) · §Vender (cobro). Cierra Q23, Q24, Q25, Q43, Q47, Q77, Q42, Q87.
  Listo cuando: un e2e cobra combinado solo con teclado (efectivo + tarjeta) y otro multiplica desde la pantalla verde.
- [x] T49 · **Pistola contra teclado.** El detector de la pistola no frena dígitos tipeados en un campo numérico de un diálogo (peso, efectivo, fondo, PIN) y lo que frena lo devuelve siempre; un escaneo con el cobro abierto no escribe en el monto; la prueba de la pistola en Ajustes no abre la ficha rápida. §Requisitos transversales (pistola). Cierra Q01, Q52.
  Listo cuando: un test tipea "10000" a 40 ms en el cobro y queda $ 10.000; "350" en el peso da 0,350 kg.
- [x] T50 · **Cobro.** "Recibido" y "Falta" coherentes al abrir; Confirmar siempre visible (QR en 1280×800 e iPhone 375); los billetes rápidos suman; el monto a cobrar con crédito incluye el recargo; la pantalla verde dice los medios de un pago combinado; el teclado de peso dice que entran gramos; descuento acotado entre 0 y el total; textos sin "Ctrl ⏎" ni "Cualquier tecla" en el celular. §Vender (cobro, venta lista). Cierra Q09, Q10, Q45, Q46, Q75, Q78, Q58, Q44.
  Listo cuando: tests de billetes que suman (20.000 + 10.000) y de crédito ($ 13.300 → "Cobrá $ 14.630"); e2e del cobro en 375 px con Confirmar visible.
- [x] T51 · **Caja y cajero.** El cajero sale de Vender a Caja (chip de caja tocable y "Salir del modo mostrador" a Caja); al entrar otro cajero con turno abierto se avisa y el cierre lo firma quien cierra; cerrar el turno de otro pide PIN; "Cerrar turno" sin "avisar al dueño" cuando cierra el dueño; "No coincide" recién después de contar; Total directo primero en el celular; sin 404 al abrir; retiro con tope y pie con el esperado real; el conteo del cierre sobrevive una recarga y los campos inválidos avisan. §Caja. Cierra Q26, Q11, Q70, Q84, Q85, Q86, Q82, Q59, Q69.
  Listo cuando: un e2e entra como cajero, vende, va a Caja desde Vender y cierra; el comprobante lleva su nombre.
- [x] T52 · **Validar antes de encolar.** Toda operación de la cola (venta, apertura, cierre, ajuste, recepción, movimiento, cliente) se valida con el esquema de packages/shared antes de darla por hecha; si igual se rechaza, la app deshace el estado local y lo dice en la pantalla (no solo en Avisos); un analizador único de números argentinos ("1000.50" = 1.000,50) con topes; precio 0, mínimo decimal por unidad y costo negativo se rechazan; plurales y géneros correctos. §Ventas sin conexión · §Requisitos transversales. Cierra Q27, Q62, Q60, Q64, Q89.
  Listo cuando: tests de la validación local (fondo −500, descuento −50 %, nota de 5000) y del analizador; e2e: abrir con −500 no deja caja fantasma.
- [x] T53 · **Doble clic e idempotencia.** Un gesto, una operación: ajuste, recepción, altas (proveedor, usuario, cliente, borrador, conteo) y PUT de Ajustes se deshabilitan hasta la respuesta; cobro de fiado con tope en la deuda (o saldo a favor explícito) y uno por toque; anular un cobro en efectivo genera el contramovimiento en caja; numeración única entre pestañas. §Caja · §Clientes y fiado. Cierra Q28, Q29, Q30, Q31, Q57.
  Listo cuando: e2e de doble clic en Ajustar stock (10 → +10 una vez) y en Confirmar recepción; test del contramovimiento.
- [x] T54 · **Errores que se entienden.** Los errores de validación de la API llegan en español, por campo y junto al campo (mapa de Zod → mensaje); el error se ve sin scrollear en el celular; Ajustes no dice "Guardado" sobre un 400 y la basura no se vuelve 0; importar muestra las filas con error y confirmar es idempotente; cambio masivo limpia el error; "Guardar borrador" y "Confirmar recepción" avisan si fallan; PIN único por negocio; nombres sin < >; sesión vencida ofrece volver a entrar. §Sistema de diseño · §Ajustes. Cierra Q61, Q08, Q65, Q66, Q67, Q68, Q63, Q90, Q91.
  Listo cuando: test del mapa de errores (rubro de 5000 → "Como mucho 60 caracteres" en Rubro); e2e: invitar con el PIN de otro falla con mensaje.
- [x] T55 · **Cámara.** Al abrir un diálogo desde un escaneo se cierra la cámara; toast "Agregado: Yerba 1 kg" (× N) sobre el visor; ventana fija para repetidos; código desconocido ofrece cargarlo también fuera de Vender; sin advertencias de ZXing en consola; Recepción y Modo carga reabren la cámara al confirmar. §Vender · §Requisitos transversales (hardware). Cierra Q16, Q17, Q32, Q02, Q13, Q71.
  Listo cuando: test de SellPage con la cámara abierta (diálogo visible y toast) y e2e con la cámara falsa de scripts/qa.
- [x] T56 · **Sin conexión y esperas.** El chip "Sin conexión · N ventas por sincronizar" y "Todo sincronizado" también en el celular; la recepción sin internet termina al instante y lo dice; esqueletos o estado de carga en los botones que tardan (entrar, cobrar fiado, reportes, sugerido). §Requisitos transversales. Cierra Q41, Q18, Q74.
  Listo cuando: e2e en 375 px: cortar la red, cobrar, chip con 1 venta; recepción sin red confirma en menos de 2 s.
- [x] T57 · **Productos en el iPhone.** Menú "Más acciones" en el celular con Modo carga, Conteos, Movimientos, Vencimientos, Promociones, Importar y Cambio masivo (según función y permiso); "Nuevo producto" con nombre y cámara para el código; confirmación al guardar; placeholders que no parecen valores (y "Listo" en Recepción confirma lo pedido); motivo del ajuste en español con la nota; sin "lotes" con la función apagada; la ficha rápida según el rol; sección de costo oculta a quien no la ve; "Buscar en N productos" estable. §Productos. Cierra Q21, Q22, Q34, Q37, Q38, Q06, Q36, Q39, Q35, Q79, Q72.
  Listo cuando: e2e en 393 px: repositor abre Modo carga y crea un producto con la cámara; dueño llega a Conteos.
- [x] T58 · **Compras y recepción.** Desde un borrador, "Ya llegó: recibir"; el seed nunca pone horas en el futuro; estados en español en la ficha del proveedor; listas y detalle que entran en 375 px; después de confirmar con faltantes, el pedido dice "Recibido parcial · faltan N"; el repositor entra a Compras y cae en Recepción; el sugerido muestra al proveedor con pedido en curso. §Compras. Cierra Q03, Q04, Q19, Q05, Q07, Q20, Q33.
  Listo cuando: e2e en 393 px: repositor recibe el 0041 desde Compras; test del seed sin fechas futuras.
- [x] T59 · **Inicio, avisos, reportes y primeros pasos.** Tarjeta de instalación chica y una sola vez; Avisos con título y volver; lo de "Requiere atención" también en la campana (o dicho); Reportes del cajero aclara "tus ventas"; los reportes cierran con el total (línea de recargos); primeros pasos ofrece Importar; vista previa de importación con datos y aviso de pesables; lista de clientes que muestra al recién creado; scroll arriba al cambiar de módulo; recargo de fábrica avisado; "¿Quién sos?"; sin 503 de Open Food Facts; "pide PIN" solo a quien no autoriza; cuenta corriente legible en 375 px. §Inicio · §Reportes · §Clientes y fiado. Cierra Q14, Q15, Q40, Q12, Q48, Q49, Q50, Q51, Q80, Q81, Q83, Q73, Q76, Q88, Q53.
  Listo cuando: test de reportes (categorías + recargos = total) y e2e de importación con vista previa de precios.
- [x] T60 · **Lenguaje de mostrador.** Un nombre por cosa (Ajustar stock, Recibir, Escanear, Sumar al pedido, Mayorista…), palabras técnicas con ayuda o traducidas (breakage, sent, PLU, u, Confirm.), íconos con texto (campana, escanear, nuevo). §Sistema de diseño. Cierra Q54, Q55, Q56.
  Listo cuando: un test busca en apps/web las palabras en inglés de la lista y no las encuentra.
- [x] T61 · **Auditoría UI: lo que bloquea.** Búsqueda global (Ctrl+K y lupa); el bloqueo por inactividad no se destraba sin PIN; cliente e historial desde Vender en el celular; pantalla de categorías; errores visibles en Cambiar categoría; "Elegir tickets" con texto. Cierra Q92 a Q98.
  Listo cuando: cada uno tiene su test.
- [x] T62 · **Auditoría UI y cámara: lo que confunde.** Los Q99 a Q159 de docs/QA-USUARIOS.md, por pantalla, en el orden de la tabla. Revisados uno por uno contra el código el 22/10. Q100 queda para la prueba en el iPhone (PRUEBA-MANUAL) y Q139 a medias (el cierre sigue en una página; DECISIONS).
  Listo cuando: cada Q tildado en QA-USUARIOS.md con su test.
- [x] T63 · **Auditoría UI: detalles.** Los Q160 a Q207, por pantalla. Quedan a medias Q174, Q187, Q198, Q200 y Q204, y abierto Q202 (filtros y deslizar en Productos); Q163 y Q184 no se cambian (DECISIONS).
  Listo cuando: cada Q tildado en QA-USUARIOS.md.
- [x] T64 · **Ronda 2: lo que rompió el destructor y lo que siguió.** Formularios que rechazan basura con mensaje y todos los errores juntos (fondo del cierre que no pasa lo contado, apertura y billetes solo con montos, medios de pago y billetes de Ajustes, conteo con tope y confirmación al aprobar, enteros en lo que se vende por unidad, códigos de barras numéricos, dañados y vencimientos en Recepción, DNI y teléfono, Varios con tope, categorías únicas, PIN obligatorio para cajero y repositor, negocio y proveedor sin HTML); PIN con teclado después de "Cambiar de usuario"; sesión vencida que lleva a entrar; proveedores solo para quien recibe o pide; descuento que se muestra al reabrir; "codigo" al importar. Cierra Q01, Q30, Q59, Q61, Q63, Q64, Q65, Q66, Q68, Q90, Q91 y, de la ronda 2, Q208, Q210, Q211, Q214 a Q229, Q232, Q234, Q236, Q239 y Q241 (Q209, Q213, Q231 y Q235 van a BLOCKERS.md; Q212, Q230, Q233, Q237, Q238 y Q240 quedan para T65).
  Listo cuando: tests de validación en shared y en la API; e2e en verde.
- [x] T65 · **Ronda 2: lo que quedó chico.** Importar avisa y cuenta los productos que cambian de nombre; efectivo rápido con Ctrl+1 a 4; tocar la cantidad en el celular abre el teclado; la barra del celular deja leer el título; el buscador de Productos en su fila; historial de cierres con encabezados. Cierra Q212, Q230, Q233, Q237, Q238, Q240.
  Listo cuando: e2e de la cantidad al toque y del efectivo rápido con teclado; check en verde.
- [x] T66 · **Ronda 3: Recepción y lo que bloqueó.** Recepción que no se reinicia con la sincronización (regresión de T62); peso con P y K y Enter que respeta el botón; tarjeta con D y C; "−" con una unidad no borra; conteos apagados dichos y tareas con todas las recepciones; barra del celular con texto y sin desbordar; sesión vencida en el celular lleva a entrar; memoria de pantallas vaciada al cambiar de persona; PLU al importar; billetes decimales; proveedor único y CUIT; mensajes en su campo; PIN que no delata. Cierra Q242 a Q265. Lo abierto (Q266 a Q283) va a BLOCKERS.md.
- [x] T67 · **Ronda 3: lo que quedó abierto.** Arqueo y cierre con teclado (F8 y Enter, foco en el primer billete, Enter para ver el resultado y cerrar) y la diferencia con un solo signo; Recepción con palabras y con cada error en su campo; "Entrar con email" de un toque; categorías en opciones planas; Ajustes sin palabras técnicas; aviso de lo que se subió al volver internet; sugerido con aviso del borrador y cantidades marcadas; clientes con encabezados; conteo con diferencias enormes marcadas; "* 99999" sin alta rápida; sesión vencida en la compu que pide el PIN; Medios de pago que se guardan solos; detalles del cobro y del pedido. Cierra Q266, Q269 a Q274, Q276 a Q282 y parte de Q283. Q267, Q268 y Q275 siguen en BLOCKERS.md.

- [~] T68 · **Simplificar UI y UX.** Pedido del dueño el 27/10: menos cosas en pantalla y menos pasos. Por pantalla, sacar lo vacío, lo repetido y lo que el spec deja en "Más"; acortar los flujos de todos los días (abrir caja, vender, cobrar, recibir, pedir). §Navegación, §Módulo Vender (modo simple), §Módulo Inicio, §Sistema de diseño.
  Listo cuando: e2e de recepción con corte de red; tests de importar, proveedores y billetes; check y e2e en verde.
