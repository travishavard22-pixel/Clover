# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
# pnpm as a plain global install rather than through corepack: at runtime the non-root user cannot
# write corepack's cache under its home, and corepack would otherwise fetch pnpm from the registry
# on every container start.
RUN npm install -g pnpm@10.33.0
# OpenSSL and CA certificates: Prisma's schema engine links against libssl, and hosted Postgres and
# object storage are reached over TLS.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
# No BuildKit cache mount: Railway validates mount ids (they must be `s/<service-id>-<path>`) and
# rejects the Dockerfile otherwise; a plain install is portable to every builder.
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build-time env: Prisma needs a URL shape but never connects during `next build`.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    BETTER_AUTH_SECRET="build-only-secret-0123456789abcdef" \
    CLOVER_ENCRYPTION_KEYS="v1:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=" \
    NEXT_PHASE="phase-production-build"
RUN pnpm exec prisma generate && pnpm exec next build

FROM base AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN groupadd --system clover && useradd --system --gid clover --home /app clover
COPY --from=build --chown=clover:clover /app/package.json /app/pnpm-lock.yaml ./
COPY --from=build --chown=clover:clover /app/node_modules ./node_modules
COPY --from=build --chown=clover:clover /app/.next ./.next
COPY --from=build --chown=clover:clover /app/public ./public
COPY --from=build --chown=clover:clover /app/prisma ./prisma
COPY --from=build --chown=clover:clover /app/prisma.config.ts ./prisma.config.ts
COPY --from=build --chown=clover:clover /app/generated ./generated
COPY --from=build --chown=clover:clover /app/scripts ./scripts
COPY --from=build --chown=clover:clover /app/src ./src
COPY --from=build --chown=clover:clover /app/tsconfig.json ./tsconfig.json
COPY --from=build --chown=clover:clover /app/next.config.ts ./next.config.ts
# Writable home for the app user: local photo storage, and the caches tools such as Prisma keep under ~/.cache.
RUN mkdir -p /app/storage /app/.cache && chown -R clover:clover /app/storage /app/.cache
USER clover
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && { pnpm db:seed || echo 'demo seed failed; starting anyway'; } && pnpm exec next start -p ${PORT}"]
