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

1. **New Project → Deploy PostgreSQL.** This creates the database service.
2. **New Service → GitHub Repo → this repository.** Name it `web`. Railway reads `railway.json`
   from the repo root: it builds the Dockerfile, runs migrations on start, and health-checks
   `/api/health`.
3. **New Service → GitHub Repo → this repository** again. Name it `worker`. In its **Settings →
   Config-as-code**, set the path to `railway.worker.json`. This service runs the job worker.
4. Optional: a third service from the same repo named `automations`, config path
   `railway.automations.json`. It runs the nightly recommendations at 09:00 UTC and exits.
5. On the `web` service, open **Settings → Networking → Generate Domain** to get a temporary
   `*.up.railway.app` address. You will replace it with your own domain in step 5.

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
| `S3_BUCKET` | `clover-photos` |
| `S3_REGION` | `auto` |
| `S3_ENDPOINT` | the R2 endpoint from step 2 |
| `S3_ACCESS_KEY_ID` | from step 2 |
| `S3_SECRET_ACCESS_KEY` | from step 2 |
| `CLOVER_INLINE_WORKER` | `0` on `web` only (the worker service does the jobs) |
| `ANTHROPIC_API_KEY` | your key from console.anthropic.com, when you want live AI |
| `FCM_SERVICE_ACCOUNT_JSON` | Firebase service account JSON (base64 is fine) — push to Android; see `native-apps.md` |
| `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY` | Apple push key (.p8 contents) — push to iPhones; see `native-apps.md` |

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
