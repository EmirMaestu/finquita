# Despliegue en el VPS

Todo corre en el VPS (Ubuntu, 8 GB de RAM) con Docker Compose, bajo tu subdominio. Los dispositivos solo hablan con Caddy: la app en `/` y la API en `/api`, con HTTPS automático (lo exigen las PWA).

> Esta guía no se ejecuta sola: cada paso lo hace una persona en el VPS.

## Servicios (`infra/docker-compose.prod.yml`)

| Servicio | Imagen | Qué hace |
| --- | --- | --- |
| `caddy` | `web` (Caddy + la PWA compilada) | HTTPS, sirve la app y hace de proxy a la API |
| `api` | `api` | Hono sobre Bun. Al arrancar aplica las migraciones pendientes |
| `worker` | `api` (otro comando) | pg-boss: chequeos de avisos cada 10 minutos y notificaciones push |
| `postgres` | `postgres:16-alpine` | La base. No se expone fuera de la red de Docker |
| `backup` | `backup` | Copia nocturna con `pg_dump` y restic, y prueba mensual de restaurar |

Consumo esperado: menos de 2 GB de RAM entre todo (hay límites por servicio). Los logs van en JSON, con rotación (10 MB × 5 por servicio).

## 1. Preparar el servidor (una vez)

1. Firewall con los puertos 22, 80 y 443: `ufw allow 22,80,443/tcp && ufw allow 443/udp && ufw enable`.
2. SSH solo con llave (`PasswordAuthentication no`), `fail2ban` y actualizaciones automáticas de seguridad (`unattended-upgrades`).
3. Instalar Docker y el plugin de Compose.
4. Apuntar el registro DNS del subdominio (por ejemplo `almacen.tudominio.com`) a la IP del VPS.

## 2. Configurar

1. Copiar `.env.example` a `.env` en el VPS y completar: `DOMAIN`, `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET` (largo y al azar), las claves VAPID (`bunx web-push generate-vapid-keys`), `REGISTRY` y `TAG`, y lo de restic (`RESTIC_REPOSITORY`, `RESTIC_PASSWORD`, `B2_ACCOUNT_ID`, `B2_ACCOUNT_KEY`).
2. Guardar `RESTIC_PASSWORD` también fuera del servidor: sin ella, las copias no se pueden leer.
3. `.env` nunca se sube al repo.

## 3. Deploy en un paso (sin CI)

En el VPS, desde la carpeta del repo y con el `.env` completo:

```sh
./infra/deploy.sh          # construye las imágenes en el servidor y levanta todo
./infra/deploy.sh --pull   # para actualizar: trae lo último de GitHub y vuelve a desplegar
```

Revisa el `.env`, etiqueta las imágenes con el commit, levanta los servicios y espera a que la API responda. Para volver a una versión anterior: `REGISTRY=mostrador TAG=<commit> docker compose -f infra/docker-compose.prod.yml --env-file .env up -d` (las versiones están en `docker images mostrador/api`).

## 3 bis. Construir las imágenes con CI (opcional)

El CI construye y publica las tres imágenes desde la raíz del repo:

```sh
docker build -f apps/api/Dockerfile -t $REGISTRY/api:$TAG .
docker build -f apps/web/Dockerfile -t $REGISTRY/web:$TAG .
docker build -f infra/backup/Dockerfile -t $REGISTRY/backup:$TAG .
docker push $REGISTRY/api:$TAG && docker push $REGISTRY/web:$TAG && docker push $REGISTRY/backup:$TAG
```

## 4. Levantar o actualizar

```sh
docker compose -f infra/docker-compose.prod.yml --env-file .env pull
docker compose -f infra/docker-compose.prod.yml --env-file .env up -d
```

La API aplica las migraciones al arrancar. La app avisa "Hay una versión nueva" y se actualiza al terminar la venta en curso, nunca en el medio.

## 5. Primer uso

Entrar a `https://almacen.tudominio.com`, crear la cuenta del dueño y seguir los primeros pasos de Inicio. Para la Mac del mostrador: Ajustes > Dispositivos.

## Copias de seguridad

- Todas las noches a las 3:30: `pg_dump` de la base y la carpeta de fotos, cifrados con restic al bucket externo. Se guardan 7 copias diarias, 4 semanales y 12 mensuales (`infra/backup/backup.sh`).
- El primer domingo de cada mes: `restic check` y restauración de la última copia en una base aparte (`infra/backup/restore-test.sh`).
- Con `BACKUP_PING_URL` (un monitor "push" de Uptime Kuma), se avisa si la copia falla o no corre.
- Restaurar a mano: `docker compose -f infra/docker-compose.prod.yml exec backup restic restore latest --target /tmp/r` y después `pg_restore`.

## Monitoreo

Uptime Kuma revisa `https://almacen.tudominio.com/api/health` cada minuto y avisa si se cae, y recibe el ping de las copias.

## VPS compartido (finquita.emir-maestu.com)

Mostrador corre en el mismo VPS que otros sitios, detrás del Caddy del sistema (no el de este compose):

- `/opt/mostrador`: `compose.yml` (proyecto `mostrador-prod`: postgres, api en `127.0.0.1:3100`, worker), `.env` (600) y `backups/`.
- `/var/www/mostrador`: la web compilada. `/etc/caddy/mostrador.caddy`, importado desde el Caddyfile.
- Copia diaria a las 04:30 (`backup.sh` por cron, guarda 30).
- Deploy desde la PC: `bash infra/vps/deploy.sh` (commit limpio).

### Panel de soporte

`https://finquita.emir-maestu.com/api/admin`, con la contraseña `ADMIN_PASSWORD` del `.env` del VPS (16 caracteres o más; sin ella el panel no existe). Muestra el estado, permite resetear contraseñas y PIN (queda en la auditoría) y bajar las copias. Para cambiar la contraseña: editar `.env` y `docker compose up -d api`.
