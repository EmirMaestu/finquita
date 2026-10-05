# Decisiones tomadas sin consultar

Lo que el spec no definía y Claude resolvió solo.
Formato: AAAA-MM-DD · Tarea · Decisión · Por qué
2026-10-05 · T04 · La barra lateral muestra los ocho módulos de v1 sin WhatsApp · El spec dice "ocho módulos en v1 (WhatsApp llega en fase 2)"; se suma cuando exista el bot.
2026-10-05 · T04 · Inter se empaqueta con @fontsource-variable/inter e íconos con lucide-react · La app tiene que verse igual sin conexión (sin Google Fonts) y el diseño usa Lucide.
2026-10-05 · T06 · Una sola empresa por instalación: las tablas no llevan business_id · El spec define un solo local sin sucursales; si llegan sucursales (fase 2), se agrega la columna.
2026-10-05 · T06 · Las migraciones se regeneran desde cero hasta el primer deploy · No hay bases en producción todavía; así el historial de migraciones queda limpio.
2026-10-05 · T06 · Roles fijos (dueño, encargado, cajero, repositor) en código y permisos finos por persona en member_permissions (allow/deny/pin) · La matriz del spec es el punto de partida y se ajusta por persona.
2026-10-05 · T06 · La caja registra un movimiento por cada medio de pago de una venta (no solo el efectivo) · Así el resumen por medio de pago del turno y el arqueo salen del mismo libro.
