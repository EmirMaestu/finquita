# Panel de admin (soporte) — diseño

Fecha: 06/10/2026 · Estado: aprobado el enfoque, falta revisión del documento

## Para qué

Un acceso para quien da soporte a la instalación (no el dueño): ver si el sistema anda, destrabar a la gente que se olvidó la contraseña o el PIN, y bajar una copia de la base. Una instalación = un local; el panel no es multi-negocio.

Fuera de alcance: entrar como el dueño, desactivar usuarios, ver errores o auditoría completa, hacer una copia en el momento (queda para después: necesita `pg_dump` en la imagen de la API).

## Enfoque

Páginas HTML servidas por la API bajo `/api/admin`, generadas en el servidor con el helper `html` de Hono (`hono/html`, escapa los valores solo), sin React ni la PWA y sin tocar la configuración de TypeScript.

- No entra en la caché del service worker (que ya excluye `/api/`), así que no queda guardado en los dispositivos del local.
- Sigue andando aunque la app web tenga un problema.
- No usa la matriz de permisos ni los roles: es un acceso aparte.

## Acceso

- Variable `ADMIN_PASSWORD` en el `.env` del servidor. Si falta o tiene menos de 16 caracteres, todo `/api/admin/*` responde 404 (el panel queda apagado).
- `GET /api/admin/login`: formulario de contraseña. `POST /api/admin/login`: compara en tiempo constante.
- Sesión: cookie `mostrador_admin` firmada con HMAC (clave derivada de `BETTER_AUTH_SECRET`), `HttpOnly`, `Secure` en producción, `SameSite=Strict`, `Path=/api/admin`, vence a las 8 h. Sin tabla nueva: la cookie lleva la fecha de vencimiento firmada.
- Cambiar `ADMIN_PASSWORD` invalida las sesiones abiertas (la firma incluye un hash de la contraseña).
- Bloqueo: 5 intentos fallidos desde la misma IP bloquean 15 minutos (en memoria del proceso; alcanza para una sola instancia de API).
- `POST /api/admin/logout` borra la cookie.
- Los POST del panel exigen el header `Origin` igual al del sitio (además de `SameSite=Strict`).

## Pantallas

Una sola página `GET /api/admin` con tres secciones; las acciones son formularios POST que redirigen de vuelta con un mensaje.

### 1. Estado del sistema

| Dato | De dónde sale |
| --- | --- |
| API | Si la página carga, anda. Versión (`APP_VERSION`, el commit, que pone el deploy) y hora de arranque del proceso |
| Base | `select 1` con su tiempo de respuesta y el tamaño de la base (`pg_database_size`) |
| Worker | Última vez que terminó bien la tarea `checks` de pg-boss. En rojo si pasaron más de 30 minutos |
| Disco | Espacio libre y total del volumen de copias (`fs.statfs` sobre `BACKUPS_DIR`) |
| Última copia | Fecha y tamaño del archivo más nuevo en `BACKUPS_DIR`. En rojo si tiene más de 36 h |

### 2. Usuarios

Tabla con todo el equipo (`members`): nombre, rol, email, activo, último ingreso (la sesión más reciente en `auth_session` o `pin_sessions`; "—" si no hay).

- **Resetear contraseña** (solo quien tiene cuenta: dueño y encargado): genera una contraseña temporal de 12 caracteres, la guarda con el mismo hash que usa Better Auth, borra todas sus sesiones abiertas y la muestra una sola vez en pantalla para pasársela.
- **Resetear PIN** (quien tiene PIN): se tipea un PIN nuevo de 4 a 6 números (se valida con `PIN_RE`), se guarda con `hashPin`, se ponen en cero los intentos fallidos y el bloqueo, y se cierran sus `pin_sessions`.

Cada acción deja un registro en `audit_log` (`action`: `admin.reset_password` o `admin.reset_pin`, `entityType: "member"`, `memberId: null`, `note: "Soporte (panel de admin)"`), así el dueño lo ve en Actividad. Nunca se guarda la contraseña ni el PIN en la auditoría.

### 3. Copias

Lista de los archivos `mostrador-*.dump` de `BACKUPS_DIR`, del más nuevo al más viejo, con fecha y tamaño. Cada uno se baja con `GET /api/admin/backups/:nombre`.

- El nombre se valida con `^mostrador-\d{4}-\d{2}-\d{2}\.dump$` (sin rutas).
- Se manda como `application/octet-stream` con `Content-Disposition: attachment`.
- Si `BACKUPS_DIR` no existe o está vacío: "Todavía no hay copias".

## Despliegue

- `compose.yml` del VPS: a la API se le suman `ADMIN_PASSWORD`, `APP_VERSION`, `BACKUPS_DIR=/backups` y el volumen `/opt/mostrador/backups:/backups:ro`.
- `.env.example`: `ADMIN_PASSWORD=` con comentario (vacío = panel apagado).
- `docs/DEPLOY.md`: sección corta de cómo entrar al panel.

## Archivos

- `apps/api/src/admin/session.ts`: firmar y verificar la cookie, bloqueo por IP.
- `apps/api/src/admin/status.ts`: junta los datos de Estado y de Copias.
- `apps/api/src/admin/users.ts`: lista y los dos resets.
- `apps/api/src/admin/views.ts`: el HTML (login y panel), con los colores del sistema de diseño.
- `apps/api/src/routes/admin.ts`: las rutas; se monta en `app.ts`.

## Errores

- Base caída: la página igual carga y muestra "Base: no responde" en rojo; las otras secciones dicen "No disponible".
- Acción sobre una persona que no existe o sin cuenta o PIN: mensaje de error en la página, sin cambios.
- Cualquier error inesperado: página "Algo falló" con el `requestId` para buscar en los logs.

## Tests (Vitest, contra la base de pruebas)

- Sin `ADMIN_PASSWORD`, `/api/admin` da 404.
- Login: contraseña mala da 401; la buena pone la cookie; el sexto intento fallido seguido da 429.
- Cookie vencida, adulterada o de otra contraseña: redirige al login.
- POST sin `Origin` correcto: 403.
- Reset de contraseña: la vieja deja de andar, la nueva entra, se borran las sesiones y queda la auditoría.
- Reset de PIN: el PIN nuevo verifica, el contador queda en cero y queda la auditoría.
- Copias: lista ordenada; un nombre con `../` da 400; bajar uno devuelve su contenido.
