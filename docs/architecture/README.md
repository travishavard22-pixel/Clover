# Clover — Product & Technical Architecture

This document turns the research in `docs/research/` into build decisions. It is the source of
truth for the codebase; when the code and this doc disagree, fix one of them in the same PR.

## 1. Product in one paragraph

Clover is a photo-first selling assistant. A seller photographs an item; Clover identifies it,
grades its condition, gathers market evidence, estimates a price with an explanation, produces
marketplace-ready photos without altering the item, writes truthful marketplace-specific listings,
publishes through official APIs where they exist (eBay now, Nextdoor when access is granted) and
walks the seller through an assisted, human-driven flow where they do not (Facebook Marketplace,
OfferUp, Craigslist). Afterwards it tracks the listing, aggregates offers, recommends repricing,
and guarantees an item is sold only once.

## 2. Principles that shape the architecture

1. **Money is computed, never generated.** LLMs identify, grade and write. Prices come from
   deterministic statistics over real comps. If there are no comps, the estimate is labelled as an
   AI estimate with low confidence — never dressed up as market data.
2. **Every AI output is a typed artifact with evidence.** Identification, condition, listing copy
   and studio images are all schema-validated JSON (or images with a provenance record) carrying
   per-field confidence and the image index or comp that supports them.
3. **Item pixels are sacred.** The photo studio segments the item and generates *around* it; the
   cut-out is re-composited byte-for-byte. Outputs are labelled AI-generated and originals are kept.
4. **Official APIs or the human does it.** No scraping, no password collection, no cookie import,
   no headless browsers, no CAPTCHA bypass — for any marketplace, ever. Assisted publishing is
   clipboard + photo pack + link-out + checklist.
5. **Work is durable and honest.** Long operations run as persisted jobs with per-step state. The
   UI shows the real step that is running, never a fake progress bar.
6. **Runs without keys.** With no third-party credentials the app runs in a clearly labelled
   Demo mode (deterministic providers) so the full product can be exercised, tested and reviewed.
7. **Security is default-on:** encrypted tokens, least-privilege scopes, rate limits, audit log,
   export and deletion from day one.

## 3. System overview

```
┌────────────────────────────── Next.js 16 (App Router) ───────────────────────────────┐
│  UI (React 19, Tailwind 4 tokens, motion, Radix)  ·  Route handlers  ·  Server actions │
│  ─ capture / analysis / studio / pricing / listing editor / publish hub / inventory     │
│  ─ dashboard / offers inbox / automations / copilot / onboarding / settings             │
└───────────────┬───────────────────────────────────────────────┬───────────────────────┘
                │ Prisma 7                                       │ SSE (job events)
┌───────────────▼──────────────┐                    ┌───────────▼───────────────────────┐
│ PostgreSQL 16                │◀── SKIP LOCKED ────│ Job worker (same process in dev,   │
│ users · items · photos ·     │                    │ `pnpm worker` in prod)             │
│ runs · comps · estimates ·   │                    │ pipelines: analyze, studio, publish│
│ drafts · publications ·      │                    │ sync, automations                  │
│ offers · rules · audit …     │                    └───────────┬───────────────────────┘
└──────────────────────────────┘                                │
        ┌───────────────────────────────────────────────────────┼─────────────────────┐
        ▼                         ▼                             ▼                     ▼
  Object storage           AI providers                  Marketplace clients     Studio providers
  local FS (dev) /         Anthropic (Claude) /          eBay (OAuth, Inventory, segmentation:
  S3-compatible (prod)     Demo (deterministic)          Media, Taxonomy, Browse, Photoroom/remove.bg/
                                                         Fulfillment, Negotiation, Runpod; compositing:
                                                         Trading BestOffer) ·       local (sharp)
                                                         Nextdoor Publish API ·
                                                         Assisted (FB/OfferUp/CL)
```

## 4. Stack decisions (ADRs)

| # | Decision | Why | Rejected |
|---|---|---|---|
| 1 | **Next.js 16 App Router, React 19, TypeScript 5.9** in a single package | One deploy unit; server components for data-heavy pages; route handlers for SSE and webhooks | Monorepo (premature), separate API service |
| 2 | **PostgreSQL 16 + Prisma 7 (`@prisma/adapter-pg`)** | Relational data with JSON columns for AI artifacts; `SKIP LOCKED` job queue; proven | SQLite (no enums/JSON ergonomics for prod), Mongo |
| 3 | **better-auth** for authentication | Email+password with Argon2-class hashing, secure HttpOnly cookies, CSRF, session rotation, Prisma adapter, OAuth-ready | Rolling our own; NextAuth v4 (legacy) |
| 4 | **Own Postgres job queue** (`Job`, `JobEvent` tables) | Durable, resumable steps; real progress via events; runs in-process for dev/tests, separate worker for scale | Inngest/Trigger.dev (external dependency for the core path), pg-boss (extra schema, less control of step events) |
| 5 | **Anthropic SDK with structured outputs** for identification, listing, copilot; **model routing by task** | Multi-image vision + `output_config.format` JSON schema gives typed, validated artifacts | Tool-forcing (400 on Fable 5.1), free-text parsing |
| 6 | **Provider interfaces + Demo providers** for AI, studio, comps, marketplaces | App is fully runnable and testable with no keys; swap real providers via env | Hard-wiring vendors |
| 7 | **Tailwind 4 with CSS custom-property tokens** (OKLCH), Radix primitives, `motion` | Design-token-driven theming (light/dark derived), accessible primitives, transform/opacity animations | Component libraries with their own look (MUI, shadcn default theme) |
| 8 | **sharp** for all image processing, local compositing for studio backgrounds | Studio-white/grey/gradient backgrounds and contact shadows cost $0; only lifestyle backgrounds call a generator | Sending originals to an image model (identity risk) |
| 9 | **AES-256-GCM envelope encryption** for marketplace tokens with versioned master key | Long-lived eBay refresh tokens are password-equivalent | Plain DB columns |
| 10 | **Own thin eBay client** (typed fetch, OAuth, retries ≤ 2) | Exact control over scopes, quotas, error mapping, sandbox; small surface | `ebay-api` npm (large, opaque) |

## 5. Data model (Prisma) — summary

Full schema: `prisma/schema.prisma`. Key entities:

- **User / Session / Account / Verification** — better-auth. `UserPreferences` holds location,
  shipping and pickup defaults, pricing strategy, notification settings, theme, onboarding step.
- **Item** — the inventory record: identity fields (title, brand, model, category path,
  attributes JSON), condition grade + notes, money (acquisition cost, estimated value, list
  price, floor price, sold price, fees, shipping cost), status
  (`DRAFT → READY → LISTED → OFFER_RECEIVED → SOLD → SHIPPED → COMPLETED | ARCHIVED`),
  storage location, notes, SKU, dates.
- **Photo** — original / enhanced / studio images with storage key, dimensions, order,
  `aiGenerated`, `studioMode`, `sourcePhotoId`, `provenance` JSON (pipeline, provider, model,
  timestamps). Originals are immutable.
- **Job / JobEvent** — durable pipeline runs (`ANALYZE_ITEM`, `STUDIO_RENDER`, `PUBLISH`,
  `SYNC_MARKETPLACE`, `RUN_AUTOMATIONS`) with `steps` JSON (key, label, status, detail, timings)
  and an append-only event log streamed to the client over SSE.
- **ItemProfile** — the identification artifact: per-field values with confidence tier, evidence
  image index, `unknowns[]`, defects[] with severity/location/evidence, `needsMorePhotos[]`,
  model + prompt version.
- **Comp** — a comparable listing: source (`EBAY_BROWSE`, `EBAY_INSIGHTS`, `USER_REPORTED`,
  `DEMO`), external id/url/image, price, shipping, condition, listed/sold dates, similarity,
  `isMarketEvidence` (true only for real marketplace data).
- **PriceEstimate** — quick / recommended / max, low / likely / high band, method JSON (weights,
  trims, multipliers, ask-to-sold ratio), explanation text, `netByMarketplace` JSON, comps count,
  effective sample size, confidence tier, `basis` (`MARKET_EVIDENCE` | `AI_ESTIMATE`).
- **ListingDraft** — per-marketplace title, description, bullets, condition text, specifics,
  keywords, category, price, shipping options, version history (`ListingDraftVersion`).
- **MarketplaceConnection** — per user per marketplace: status, encrypted refresh token,
  encrypted access token + expiry, scopes, external account id/name, last sync, last error,
  metadata (eBay policies, location key; Nextdoor profile).
- **Publication** — an item on a marketplace: mode `API` | `ASSISTED`, status
  (`READY, NEEDS_ATTENTION, PUBLISHING, PUBLISHED, FAILED, REQUIRES_USER_ACTION, ENDED, SOLD`),
  external ids/url, checklist JSON (assisted), fee preview, last error with recovery hint.
- **Offer** — aggregated buyer offers (eBay Best Offers via API; manual entry for assisted
  channels): amounts, buyer, message, status, suggested response JSON, counter history.
- **AutomationRule** — type (`REPRICE_STALE`, `STALE_LISTING`, `PHOTO_QUALITY`, `TITLE_QUALITY`,
  `OFFER_ALERT`, `SOLD_SYNC`, `DOUBLE_SELL_GUARD`, `SHIPPING_PREP`, `PENDING_ACTION_REMINDER`),
  mode `OFF | SUGGEST | ASK | AUTO`, config JSON.
- **Recommendation** — automation outputs shown in "Needs attention": type, title, body,
  proposed change, status (`OPEN, APPLIED, DISMISSED, SNOOZED`).
- **Notification**, **AuditLog**, **CopilotThread / CopilotMessage**, **ApiQuota** (per-provider
  daily counters), **RateLimitBucket**.

## 6. AI pipeline

### 6.1 `ANALYZE_ITEM` job steps (each persisted, each streams a status line)

| Step key | Status line (action + object) | What actually happens |
|---|---|---|
| `prepare` | Preparing 4 photos | EXIF orientation, strip GPS, resize ≤ 1568 px, store derivatives |
| `identify` | Identifying the item | Claude vision, structured output → `ItemProfile` (schema in `src/lib/ai/schemas.ts`) |
| `verify` | Checking the brand and model | Barcode lookup if a code is visible; escalation to a stronger model when identity confidence < 0.7 |
| `condition` | Grading condition and defects | Part of the same artifact; mapped to eBay condition IDs |
| `comps` | Searching eBay for comparable listings | Browse API `item_summary/search` (gtin/epid/q + category + condition filters), cached 24 h |
| `price` | Calculating a price from N comps | Deterministic engine (`src/lib/pricing/engine.ts`): similarity gate → landed price → IQR trim → condition multipliers → time-decay weights → weighted P25/P50/P75 → ask-to-sold ratio → fee netting |
| `photos` | Preparing studio photos | Enqueues `STUDIO_RENDER` for the default Clean Studio mode |
| `listing` | Writing the listing | Claude grounded on the verified attributes only; then a cheap self-check pass that rejects unsupported claims |
| `done` | Ready for review | Item → `READY` |

Model routing (env-overridable): identification, listing drafts and copilot default to
`claude-opus-5`; QA / self-check / truncation passes use `claude-haiku-4-5`. `claude-sonnet-5` is
a supported cost-saving override for identification. Every request sets `output_config.effort`
per task and uses prompt caching on the frozen system prompt.

### 6.2 Honesty contract (enforced in code, not just prompts)

- Identification fields carry `confidence` ∈ {`CONFIDENT`, `LIKELY`, `NEEDS_CHECK`} and
  `evidenceImage`. Fields the model did not *read* from an image go to `unknowns`.
- The listing generator receives the verified attribute JSON, never the photos. A self-check
  pass lists factual claims and flags any not present in the attributes; flagged drafts are
  rewritten or rejected.
- `PriceEstimate.basis` is `MARKET_EVIDENCE` only when ≥ 3 real comps passed the similarity gate;
  otherwise `AI_ESTIMATE`, shown with a distinct label and low confidence.
- Demo providers tag every artifact with `provider: "demo"` and the UI shows a persistent
  "Demo data" badge.

### 6.3 Photo studio (`STUDIO_RENDER`)

Modes: `CLEAN_STUDIO`, `LUXURY`, `LIFESTYLE`, `ECOMMERCE`, `MARKETPLACE`, `SOCIAL`, `DETAIL`,
`CONDITION`. Pipeline: segment (provider) → keep cut-out → render background (local for studio
modes; generator for `LIFESTYLE` / `SOCIAL` using the inverted mask) → re-composite cut-out →
contact shadow → colour balance → aspect crop → provenance record (+ XMP `DigitalSourceType`
marker). `CONDITION` mode never removes backgrounds; it crops to the defect and draws a subtle
ring. Without a segmentation provider, studio modes fall back to *enhancement only*
(levels, white balance, framing) and are labelled as such.

## 7. Marketplace integration strategy

| Marketplace | Mode | Implementation |
|---|---|---|
| eBay | **API** | OAuth (authorization code, `state`), scopes `sell.inventory sell.account sell.fulfillment commerce.identity.readonly` (+ `commerce.message`, `commerce.notification.subscription` when enabled); Taxonomy suggestions + required aspects; Media upload; Inventory item → offer → `getListingFees` → `publishOffer`; `withdrawOffer` on sold elsewhere; Fulfillment `getOrders` sync; Trading `GetBestOffers`/`RespondToBestOffer` for buyer offers; Browse (client-credentials) for comps. Sandbox supported via env. |
| Nextdoor | **API (gated) + assisted** | OAuth (`openid post:write`), `POST /external/api/partner/v1/post/fsf/`, `PUT` sold. When the app has no Publish API credentials the channel runs in assisted mode. |
| Facebook Marketplace | **Assisted** | Marketplace-specific copy, clipboard, photo pack (Web Share on mobile), link-out to the create page, checklist, pasted-URL confirmation. Explicit disclosure that Meta offers no API. |
| OfferUp | **Assisted** | Same; 12-photo pack; condition mapping to OfferUp's vocabulary. |
| Craigslist, Mercari, Poshmark | **Assisted** (secondary, behind a flag) | Same flow. |

Each marketplace implements `MarketplaceAdapter` (`src/lib/marketplaces/types.ts`):
`capabilities()`, `connect/disconnect`, `preparePublication(item, draft)`, `publish()`,
`update()`, `end()`, `syncOffers()`, `syncOrders()`. Assisted adapters implement the same
interface and return `REQUIRES_USER_ACTION` with a checklist instead of calling anything.

## 8. Security

- Auth: better-auth, HttpOnly Secure SameSite=Lax cookies, session rotation, password policy,
  email verification hook, account lockout after repeated failures (rate limiter).
- Secrets only from env (`src/lib/env.ts` validates with zod at boot); never in the client
  bundle (`NEXT_PUBLIC_` prefix reserved for non-secrets).
- Marketplace tokens: AES-256-GCM, per-record random IV, key id for rotation
  (`CLOVER_ENCRYPTION_KEYS="v2:<base64>,v1:<base64>"`).
- Input validation with zod on every route handler and server action; file uploads validated
  by magic bytes and re-encoded by sharp (strips metadata, defuses malformed files).
- Rate limiting: per-IP and per-user buckets in Postgres (works across instances) on auth,
  upload, AI and publish endpoints.
- Audit log for auth events, connections, publications, deletions, exports.
- Privacy: data export (JSON + photos zip), account deletion (cascades, revokes connections),
  disconnect per marketplace, eBay account-deletion notification endpoint.
- Headers: CSP, HSTS, frame-ancestors none, referrer-policy, permissions-policy (camera only
  on our origin).
- Sessions: the settings page lists devices by opaque id and revokes server-side; session tokens
  never reach the browser as data. No session cookie cache, so revocation, password changes and
  account deletion take effect on the next request.
- Webhooks: eBay account-deletion notifications are verified against eBay's published signing key
  (`X-EBAY-SIGNATURE`, ECDSA over the body) before any data is touched, and matched on the
  immutable eBay user id only.
- Prompt boundary: third-party text that reaches a model — buyer messages, comparable-listing
  vocabulary, copy being revised, tool results — is wrapped in `<untrusted source="…">` tags and
  every system prompt states that such text is data, never instructions. Copilot tools are
  read-only or produce proposals the seller confirms; a confirmation is applied from the
  proposal stored with the conversation, not from the request body.
- Baseline per-user rate limit on every signed-in route, with tighter limits on AI, publishing,
  export and account endpoints; signed file URLs use a purpose-derived key (HKDF) and expire.

## 9. Runtime modes

| Env | Behaviour |
|---|---|
| `ANTHROPIC_API_KEY` unset | AI provider = Demo (deterministic identification/listing/copilot from a small catalogue keyed by image hash + user hints). Badge shown. |
| `EBAY_CLIENT_ID/SECRET` unset | eBay adapter runs in Demo (simulated sandbox: OAuth screen mock, fake listing ids, simulated offers). Comps come from the Demo comps provider (labelled, `isMarketEvidence=false`). |
| `STUDIO_SEGMENTATION_PROVIDER` unset | Studio = enhancement only, labelled. |
| `STORAGE_DRIVER=local` | Files under `./storage` served through `/api/files/[...key]` with signed URLs. |

## 10. Testing strategy

- **Unit (vitest, `tests/unit`):** pricing engine (similarity gate, IQR trim, condition and time
  weighting, bootstrap band, fee netting), condition mapping, listing composition, transforms and
  the self-check against item facts, AI schemas and the deterministic Demo provider, studio mask
  and compositor, marketplace registry and rendering, offer advice, automation rules,
  recommendations, copilot tools, inventory computations, crypto, money, SKU and signed URLs.
- **Integration (vitest + Postgres, `tests/integration`):** the durable job queue and runner
  (claim, retry, step events) and the Postgres rate limiter.
- **E2E (Playwright, `tests/e2e`, desktop and mobile projects):** sign-up → sign-out → sign-in and
  weak-password errors; security headers, CSP and the signed file route; protected APIs refusing
  anonymous calls; seeded demo flows across home, inventory filters, insights tables,
  notifications, sell and welcome; upload → analysis → review through the real job pipeline in
  Demo mode; an axe-core scan of every route (WCAG 2.1 AA plus best practices) that fails on
  serious or critical violations. A `setup` project signs in once and shares the session.
- **Contrast check script** (`pnpm check:contrast`) over the token file for both themes.
- **CI** runs typecheck, lint, unit and integration tests, the contrast check and a production
  build, then the end-to-end suite against a Postgres service.

## 11. Repository layout

```
prisma/                 schema + migrations + seed
public/brand/           logo mark, wordmark, app icons
src/app/                routes (app router), route handlers under src/app/api
src/components/         ui primitives (tokens-driven), feature components
src/lib/                env, db, auth, crypto, storage, jobs, ai, pricing, studio,
                        marketplaces, automations, copilot, audit, ratelimit
src/styles/             tokens.css, globals.css
scripts/                worker, contrast check, seed helpers
tests/                  unit, integration, e2e
docs/                   research, brand, architecture, runbooks
```
