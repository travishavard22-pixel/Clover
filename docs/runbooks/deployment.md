# Deployment runbook

New to hosting? Start with `hosted-setup.md`, which walks through creating the accounts and
configuring Railway and Cloudflare R2 step by step. This document is the reference for any
platform.

## Topology

- **web**: Next.js server (`next start`). Stateless apart from local storage when `STORAGE_DRIVER=local`.
- **worker**: `pnpm worker` — runs jobs (analysis, studio renders, publishing, marketplace sync,
  automations, exports, deletions). Scale horizontally; jobs are claimed with `SKIP LOCKED`.
  For a single-instance deployment you can instead leave `CLOVER_INLINE_WORKER` unset and the web
  process runs the worker in-process.
- **PostgreSQL 16**: the only stateful dependency besides object storage.
- **Object storage**: local disk (dev / single node) or any S3-compatible bucket (`STORAGE_DRIVER=s3`).

## First deploy

1. Provision Postgres and a bucket. Set every variable in `.env.example` (secrets via your secret
   manager, never in the image).
2. Generate secrets: `openssl rand -base64 32` for `BETTER_AUTH_SECRET`; `v1:$(openssl rand -base64 32)`
   for `CLOVER_ENCRYPTION_KEYS`.
3. `docker compose up --build` (or deploy the image to your platform). The container runs
   `prisma migrate deploy` on start.
4. Verify `GET /api/health` returns `status: ok` and the `capabilities` you expect.
5. Optional: `pnpm db:seed` creates the demo account (`demo@clover.local`).

## Scheduled automations

Run `RUN_AUTOMATIONS` nightly by enqueuing a job from cron, e.g.
`pnpm exec tsx -e "import('./src/lib/automations').then(m => m.enqueueAutomationsForAllUsers())"`.
Marketplace sync for API connections is enqueued on demand and after publishing; add an hourly cron
the same way with `SYNC_MARKETPLACE` if you want passive polling.

## Key rotation

Prepend a new key: `CLOVER_ENCRYPTION_KEYS="v2:<new>,v1:<old>"`. New tokens use v2; old tokens
still decrypt and are re-encrypted lazily on next use (`needsRotation`). Drop v1 once the audit shows
no v1 ciphertexts remain.

## Backups

Postgres nightly base backup + WAL; bucket versioning on. Originals are immutable so a restore never
loses seller photos.

## Observability

- `/api/health` for liveness (database + capabilities).
- `Job` / `JobEvent` tables are the source of truth for pipeline state; `FAILED` jobs carry `error`.
- `AuditLog` for security-relevant actions.
- `ApiQuota` shows eBay Browse usage against the 5,000/day default.
