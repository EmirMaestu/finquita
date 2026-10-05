# API y worker (misma imagen): Hono sobre Bun. Se construye desde la raíz del repo:
#   docker build -f apps/api/Dockerfile -t mostrador-api .
FROM oven/bun:1.4 AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile --filter @mostrador/api

FROM oven/bun:1.4
WORKDIR /app
ENV NODE_ENV=production PORT=3000 FILES_DIR=/data/files
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY package.json tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
WORKDIR /app/apps/api
RUN mkdir -p /data/files && chown -R bun:bun /data
USER bun
EXPOSE 3000
# Aplica las migraciones pendientes y arranca. El worker usa la misma imagen con otro comando.
CMD ["sh", "-c", "bun scripts/migrate.ts && exec bun src/main.ts"]
