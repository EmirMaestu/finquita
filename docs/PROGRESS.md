# Progreso

Una línea por tarea terminada o por intento relevante.
Formato: AAAA-MM-DD HH:MM · Tarea · Resultado · Commit
2026-10-05 11:09 · T01 · Bun workspaces, TS estricto, Biome, Vitest con proyectos; check en verde (5 tests) · commit "T01: monorepo y herramientas"
2026-10-05 11:10 · T02 · Drizzle + postgres.js, migración inicial, docker-compose.dev.yml, bases de test por archivo desde plantilla · commit "T02: base de datos y migraciones"
2026-10-05 11:11 · T03 · createApp con dependencias, ApiError, logs JSON, validate(); 6 tests de API · commit "T03: API base con health, errores, logs JSON y Zod"
2026-10-05 11:14 · T04 · Tailwind v4 con tokens claro/oscuro, barras de celular, tablet y compu; build ok; 6 tests de layout · commit "T04: app base con tokens, router y layout de iPhone y Mac"
2026-10-05 11:18 · T05 · vite-plugin-pwa (prompt), íconos de prueba, aviso que espera a que termine la venta, guía de 2 pasos; test del build y del aviso · commit "T05: PWA con manifest, service worker, aviso de versión nueva y guía para iPhone"
2026-10-05 11:22 · T06 · 38 tablas (catálogo, stock, caja, ventas, fiado, compras, avisos, auditoría, sync); tests de restricciones clave · commit "T06: esquema núcleo"
2026-10-05 11:27 · T07 · Almacén La Esquina: equipo, 26 productos, 6 proveedores, 5 clientes con fiado, pedidos 0041 y 0042, facturas; seed idempotente con tests de saldos y del pedido · commit "T07: datos de ejemplo del escenario"
2026-10-05 11:35 · T08 · Better Auth (email y contraseña, alta solo por invitación), PIN argon2 con bloqueo de 5 min tras 5 intentos, dispositivos con token y revocación, cambio rápido de usuario; 12 tests · commit "T08: autenticación con email, PIN y dispositivos habilitados"
2026-10-05 11:38 · T09 · Matriz en shared (allow/deny/pin/approval/own), ajustes por persona, autorización con PIN de encargado o dueño; tests por rol de 13 acciones · commit "T09: permisos de la matriz en la API"
2026-10-05 11:40 · T10 · audit()/auditFrom() con diff de campos, GET /api/audit con filtros (persona, tipo, acción, fechas, paginado), PIN y dispositivos auditados; 5 tests · commit "T10: auditoría de cambios sensibles"
2026-10-05 11:43 · T11 · 11 tipos de operación con Zod (venta, anulación, devolución, caja, stock, producto, cliente, cobro de fiado, faltantes), sobre con op_id, reglas de conflicto y reloj; tests por tipo · commit "T11: protocolo de sincronización en shared"
2026-10-05 11:50 · T12 · POST /api/sync/push con op_id único, una transacción por operación y respuesta por operación; servicios de venta, anulación, devolución, caja, stock, productos, clientes, fiado y faltantes; rechazos a Avisos; 8 tests · commit "T12: push de sincronización idempotente con servicios de dominio"
2026-10-05 11:56 · T13 · change_log con triggers, cursor xid:seq sin pérdidas ni repetidos, bajas marcadas, paginado y costos filtrados por permiso; 7 tests · commit "T13: pull de sincronización con cursor y bajas"
2026-10-05 12:00 · T14 · Dexie (catálogo, clientes, caja, cola, efectos optimistas), push en lotes de 100 que para en el primer error, pull con cursor, motor con disparadores (inicio, 20 s, online, kick) y chip de conexión; 11 tests · commit "T14: cliente de sincronización en la web"
2026-10-05 12:02 · T14 · Corrección: el commit de T14 había quedado con typecheck en rojo; se tiparon los tests y check vuelve a verde · commit "T14: tipos del servidor de prueba de la cola"
