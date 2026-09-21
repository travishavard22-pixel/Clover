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

## Scheduled work

The worker runs its own heartbeat — **no cron to set up**. Once a minute it asks the job table
whether anything is due and enqueues it:

| Work | Default | Variable |
|---|---|---|
| `SYNC_MARKETPLACE` per connected seller — pulls new offers and orders | every 15 min | `CLOVER_SYNC_MINUTES` |
| `RUN_AUTOMATIONS` across every seller — evaluates rules, executes the AUTO ones | every 60 min | `CLOVER_SWEEP_MINUTES` |

Both are clamped to 5–1440 minutes. Run as many workers as you like: the due check takes a Postgres
advisory lock, so exactly one of them enqueues, and work that is still queued or running is never
stacked on.

A third trigger is event-driven rather than scheduled: when an item finishes analysis, the worker
queues a sweep for that seller a minute later, so auto-publish lists it promptly instead of waiting
for the hourly run. A sweep already waiting for that seller is reused, so importing fifty items
queues one sweep, not fifty. Sellers with auto-publish off are skipped entirely.

This is what makes an unattended deployment actually unattended. Before it, both jobs were enqueued
only by a button in the app or by a cron the deployment may never have configured — a server that
looked healthy while no offer ever arrived on its own.

### What runs unattended, and what never does

Two automations act on the seller's behalf rather than suggesting: **offer autopilot** answers
buyer offers, and **auto-publish** puts listings live. Both default to suggestions only and must be
switched to AUTO deliberately. Both enforce their own limits a second time at apply time, reading
fresh rows rather than trusting the proposal — an offer that changed, a price that moved or an item
that already sold fails with a 409 instead of transacting on stale numbers.

**Connection health** is the counterweight to both. A marketplace authorization that expires or is
revoked stops everything without erroring anywhere the seller can see — so the sweep reports a
broken connection, and reports an approaching expiry before it happens rather than after. It has no
AUTO mode: reconnecting means signing in on the marketplace, which only the seller can do.

Neither one can act where Clover has no API. On an assisted marketplace the reply or the listing is
prepared and handed to the seller as a checklist, and the UI says so rather than implying it went
out.

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
