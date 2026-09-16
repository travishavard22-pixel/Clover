<p align="center">
  <img src="public/brand/clover-mark.svg" width="56" alt="Clover" />
</p>
<h1 align="center">Clover</h1>
<p align="center"><strong>Photograph it. It's for sale.</strong></p>
<p align="center">An AI resale assistant that turns photos into priced, written, photographed listings across marketplaces — honestly.</p>

---

Clover identifies what you're selling, grades its condition, gathers market evidence, estimates a price with an explanation, produces marketplace-ready photos without altering the item, writes truthful marketplace-specific listings, publishes through official APIs where they exist (eBay; Nextdoor when access is granted) and guides you through posting where they don't (Facebook Marketplace, OfferUp, Craigslist). Afterwards it tracks listings, aggregates offers, recommends repricing, and makes sure an item is sold only once.

## Principles

- **Money is computed, never generated.** Prices come from deterministic statistics over real comparables; when there is no evidence the estimate says so.
- **Every AI output carries confidence and evidence.** Plain-language tiers on every field; evidence on tap.
- **Item pixels are sacred.** The studio changes backgrounds, shadows and framing — never the item. AI backgrounds are labelled.
- **Official APIs or the human does it.** No scraping, password collection, cookie import, headless browsers or CAPTCHA bypass — ever.
- **Runs without keys.** With no credentials the whole product runs in a labelled Demo mode.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 design tokens · Prisma 7 + PostgreSQL 16 · better-auth · Anthropic Claude (vision, structured outputs, tool use) · sharp · a Postgres-backed durable job queue with SSE progress.

## Quick start

```bash
pnpm install
cp .env.example .env            # fill BETTER_AUTH_SECRET and CLOVER_ENCRYPTION_KEYS (see file)
pnpm db:migrate                 # needs DATABASE_URL pointing at Postgres 16
pnpm db:seed                    # optional demo account: demo@clover.local / clover-demo-2026
pnpm dev                        # http://localhost:3000
```

Add `ANTHROPIC_API_KEY` for live AI, eBay keys for live publishing, and a studio segmentation provider for background replacement. Everything else works in Demo mode.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js |
| `pnpm worker` | Dedicated job worker (`CLOVER_INLINE_WORKER=0` on web when using it) |
| `pnpm check` | typecheck + lint + unit tests + token contrast check |
| `pnpm test:e2e` | Playwright end-to-end in Demo mode |
| `pnpm db:migrate` / `db:deploy` / `db:seed` / `db:studio` | Prisma |

## Development notes

- **Environment loading.** `next dev` reads `.env` itself. The worker (`pnpm worker`) and the seed
  (`pnpm db:seed`) run under `tsx`, so they load `.env` through `src/lib/env-file.ts`; CI provides
  variables directly and needs no file.
- **Dev origins.** `next.config.ts` allows `127.0.0.1` and `localhost` as dev origins and
  `src/lib/auth.ts` trusts both loopback hosts outside production, so the app works whichever
  host you open. In production only `APP_URL` is trusted.
- **CSP.** `src/proxy.ts` issues a per-request nonce and sets the Content-Security-Policy; the
  theme bootstrap script in `src/app/layout.tsx` is the only inline script and carries that nonce.
- **Route types.** `pnpm typecheck` reads the route types Next generates under `.next/types`;
  run `pnpm exec next typegen` (or `pnpm dev`/`pnpm build`) first if the folder is missing.
  `NEXT_DIST_DIR` moves the build folder so several dev servers can share one checkout.
- **Lint.** ESLint is pinned to 9.x until `eslint-plugin-react` supports ESLint 10. The React
  Compiler rule `react-hooks/set-state-in-effect` is a warning (see `eslint.config.mjs`).
- **End-to-end tests.** Playwright starts `next dev` on `E2E_PORT` (default 3100) in Demo mode,
  seeds the demo account, signs in once in a `setup` project and shares the session with the
  desktop and mobile projects. The suite includes an axe-core accessibility scan of every route.
  Set `PLAYWRIGHT_CHROMIUM_PATH` to use a preinstalled Chromium.

## Documentation

- `docs/research/` — UI/UX trends, competitive analysis, marketplace API feasibility, AI pipeline & pricing research (with sources).
- `docs/brand/brand-identity.md` — name, identity, colour, type, motion.
- `docs/architecture/README.md` — decisions, data model, pipeline, integration strategy, security.
- `docs/runbooks/` — deployment and marketplace setup.

## Security & privacy

OAuth-only marketplace connections with AES-256-GCM encrypted tokens and versioned keys; least-privilege scopes; zod-validated inputs; Postgres-backed rate limiting; audit log; nonce-based CSP; metadata stripped from uploads; data export and account deletion built in. See `docs/architecture/README.md` §8.

## License

Proprietary — all rights reserved.
