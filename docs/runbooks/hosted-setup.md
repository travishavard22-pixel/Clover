# Hosted setup, from zero accounts

This gets Clover running at a real address that opens from any device, with nothing to start by
hand. It takes about an hour the first time. Three accounts are involved: **Railway** (web,
worker, Postgres), **Cloudflare** (photo storage on R2, plus the domain), and, later, **eBay
Developer** for live publishing. Everything else is optional.

The result: `https://app.<your-domain>` serving the web app, a worker running jobs in the
background, nightly automations, photos in a bucket, and daily database backups.

## 1. Accounts

1. Create a Railway account at railway.com and choose the Hobby plan (a few dollars a month
   covers web + worker + Postgres at this scale).
2. Create a Cloudflare account at cloudflare.com. Buy a domain there under **Domain
   Registration** (or bring one you own and point its nameservers at Cloudflare).
3. Connect Railway to your GitHub account so it can deploy this repository.

## 2. Photo storage (Cloudflare R2)

1. In Cloudflare, open **R2 Object Storage** and create a bucket named `clover-photos`. Leave it
   private; Clover serves photos through its own signed links.
2. Open **Manage R2 API tokens**, create a token with **Object Read & Write** on that bucket, and
   copy the *Access Key ID*, *Secret Access Key*, and the S3 endpoint
   (`https://<account-id>.r2.cloudflarestorage.com`).

## 3. Database and services (Railway)

Config as Code (`railway.json`) is deprecated — Railway refuses it on new services and stops
reading existing files on 2026-12-01 — so the services are described in `.railway/railway.ts`
(Infrastructure as Code) instead. That file is applied with the CLI, not read during a deploy.

The declarative route, once the project and database exist:

```bash
npm install -g @railway/cli   # or: brew install railwayapp/railway/railway
railway login
railway link                  # pick the project and the production environment
railway config plan           # review — it must not show deletes of services, volumes or variables
railway config apply
```

`railway config plan` is read-only. Read it before applying: the spec lists every variable each
service holds precisely because an apply treats an omitted variable as a deletion.

Setting it up by hand instead:

1. **New Project → Deploy PostgreSQL.** This creates the database service.
2. **New Service → GitHub Repo → this repository.** Name it `web`. Railway builds the Dockerfile,
   whose `CMD` runs migrations and the demo seed before starting Next.js. In **Settings** set the
   healthcheck path to `/api/health` with a 300s timeout — the first boot seeds the catalogue and
   takes about a minute.
3. **New Service → GitHub Repo → this repository** again, named `worker`. Set its **start command**
   to `pnpm exec tsx scripts/worker.ts`. This matters: without it the service inherits the
   Dockerfile's `CMD` and runs a second web server *and* a second demo seed, and two seeds racing
   each other is a real failure — the loser deletes items the winner is still attaching photos to.
   (The seed takes a Postgres advisory lock, so the race is now survivable rather than corrupting,
   but the worker still should not be seeding or serving HTTP.)
4. Optional: a third service from the same repo named `automations`, with start command
   `pnpm exec tsx -e "import('./src/lib/automations').then((m) => m.enqueueAutomationsForAllUsers()).then(() => process.exit(0))"`,
   a **cron schedule** of `0 9 * * *` and restart policy `NEVER`. It enqueues the nightly
   recommendations and exits.
5. On the `web` service, open **Settings → Networking → Generate Domain** to get a temporary
   `*.up.railway.app` address. You will replace it with your own domain in step 5.

The cron schedule, restart policy and Dockerfile path live as service settings either way: the IaC
DSL has no documented fields for them, so `.railway/railway.ts` does not try to own them.

## 4. Environment variables

Set these on **both** `web` and `worker` (and `automations` if you added it). Railway's
**Shared Variables** at the project level is the easiest way to set them once.

| Variable | Value |
|---|---|
| `DATABASE_URL` | Reference the Postgres service: `${{Postgres.DATABASE_URL}}` |
| `APP_URL` | `https://app.<your-domain>` (use the temporary Railway domain until step 5) |
| `BETTER_AUTH_SECRET` | Run `openssl rand -base64 32` on your computer, paste the result |
| `CLOVER_ENCRYPTION_KEYS` | `v1:` followed by another `openssl rand -base64 32` |
| `STORAGE_DRIVER` | `s3` |
| `S3_BUCKET` | the bucket's **name**, e.g. `clover-photos` |
| `S3_REGION` | `auto` |
| `S3_ENDPOINT` | the R2 endpoint from step 2, with **no bucket name appended** |
| `S3_ACCESS_KEY_ID` | from step 2 |
| `S3_SECRET_ACCESS_KEY` | from step 2 |
| `CLOVER_INLINE_WORKER` | `0` on `web` only (the worker service does the jobs) |
| `ANTHROPIC_API_KEY` | your key from console.anthropic.com, when you want live AI |
| `ANTHROPIC_WORKSPACE_ID` | only for an organization-level key — see below |
| `FCM_SERVICE_ACCOUNT_JSON` | Firebase service account JSON (base64 is fine) — push to Android; see `native-apps.md` |
| `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY` | Apple push key (.p8 contents) — push to iPhones; see `native-apps.md` |

Two mistakes in that table are easy to make and hard to read back, because R2 only rejects them at
the first write — long after the deploy goes green:

- **`S3_BUCKET` is the bucket name, not the API token's label.** Pasting the label (for example
  `R2 Account Token`) fails every upload with `InvalidBucketName: The specified bucket name is not
  valid`, and the bucket name R2 echoes in that error is the wrong value you set.
- **`S3_ENDPOINT` ends at the account host.** `https://<account-id>.r2.cloudflarestorage.com` is
  right; appending `/<bucket>` is not.

Signed in, `GET /api/health/storage` round-trips a small object through the driver and returns the
driver's own error, which is the quickest way to confirm the bucket before hunting through logs.

A third easy-to-miss one is the Anthropic key's scope. A key created at the **organization** level
is not scoped to a workspace, and the API rejects every request with a 400 saying to include an
`anthropic-workspace-id` header — the deploy is healthy and the key is valid, but identification
fails at the first photo. Either set `ANTHROPIC_WORKSPACE_ID` to the workspace's ID (Console →
Settings → Workspaces, in the workspace's own page) or create a replacement key from inside a
workspace, which carries its own scope and needs no header.

Signed in, `GET /api/health/ai` sends the smallest possible real request for each structured-output
schema and reports which the API accepts. It is the counterpart to the storage probe: a key-scope
problem and a schema the API will not compile look identical from the seller's side — the job just
says identification failed — and this names which schema failed and why, from the deployment's own
key. `max_tokens: 1` on the cheapest model keeps a probe's cost at effectively nothing. When the
identify schema is the one rejected, it also walks a ladder of progressively smaller versions of it
and reports which compile, so the limit is bracketed in that same request rather than over another
deploy-and-ask cycle.

Without `ANTHROPIC_API_KEY` and eBay credentials the app runs in labelled Demo mode, which is a
fine way to try the hosted version before paying for anything.

Trigger a redeploy after saving variables. The `web` service is healthy when
`https://<domain>/api/health` returns `"status":"ok"` with `"database":"ok"`.

## 5. Your own domain

1. In Railway, `web` service → **Settings → Networking → Custom Domain** → `app.<your-domain>`.
   Railway shows a CNAME target.
2. In Cloudflare DNS, add a **CNAME** record `app` pointing at that target. Set the proxy status
   to **DNS only** (grey cloud) so Railway can issue the certificate.
3. Update `APP_URL` to `https://app.<your-domain>` and redeploy. Cookies and OAuth are bound to
   this value, so change it before creating real accounts.

## 6. First sign-in

Open the address, create your account at `/sign-up`, and run through onboarding.

The demo seller loads itself. While `CLOVER_DEMO_MODE` is set, every container start runs the seed,
so the first boot after a deploy populates 14 items with the full generated photo set. Sign in with
`demo@clover.local` / `clover-demo-2026` to browse it.

Details worth knowing:

- **It only runs in demo mode.** With `CLOVER_DEMO_MODE` unset the seed exits without touching the
  database, so the demo catalogue can never appear in a real seller's account.
- **It runs once.** `seedDemoAccount()` returns early when the account already has items, so the
  first boot costs about 30 seconds and later boots cost a single count query.
- **A seed failure does not take the site down.** The start command logs and continues to
  `next start`, so a transient database or storage error leaves you with an empty app rather than a
  failed deploy. Check the deploy logs for `demo seed failed` if the catalogue is missing.
- **To reload it after changing the catalogue or the photos**, set `CLOVER_SEED_RESET=1` and
  redeploy. That deletes the demo account's items and rebuilds them. Unset it afterwards, or every
  boot will rebuild the catalogue.
- Storage matters here: with `STORAGE_DRIVER=local` the seeded photos live on one container's
  ephemeral disk and vanish on redeploy. Set the `S3_*` variables (step 4) to keep them.

## 7. Live marketplaces (when you are ready)

Follow `marketplace-setup.md`. For eBay you will register an app at developer.ebay.com, set the
OAuth redirect (RuName) to your `APP_URL`, and add `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`,
`EBAY_RU_NAME` and `EBAY_ACCOUNT_DELETION_VERIFICATION_TOKEN` as variables. Start with
`EBAY_ENV=sandbox`.

## 8. Keep it healthy

- **Backups:** Railway Postgres keeps daily backups on paid plans; enable them in the database
  service settings. R2 keeps photos durable on its own.
- **Logs:** each Railway service has a live log view. Failed jobs also appear in the app under the
  item that triggered them.
- **Updates:** Railway redeploys `web` and `worker` on every push to `main`. Merge a pull request
  and the hosted app updates within a few minutes.
- **Native apps:** once the address is stable, build the desktop and phone apps against it. See
  `native-apps.md`.
