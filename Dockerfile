# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
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
RUN mkdir -p /app/storage && chown clover:clover /app/storage
USER clover
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && pnpm exec next start -p ${PORT}"]
