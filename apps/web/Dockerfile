# Web (PWA) servida por Caddy, que además hace HTTPS y el proxy a la API.
#   docker build -f apps/web/Dockerfile -t mostrador-web .
FROM oven/bun:1.4 AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile --filter @mostrador/web
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
RUN cd apps/web && bunx vite build

FROM caddy:2-alpine
COPY --from=build /app/apps/web/dist /srv
COPY infra/Caddyfile /etc/caddy/Caddyfile
