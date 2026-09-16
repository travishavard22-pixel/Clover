# 04 — AI Pipeline, Market Comps and Pricing: Architecture Research

Status: research draft, September 2026. Author: AI/ML architecture research pass for Clover (AI resale assistant).

Scope: the technical building blocks for (1) photo-based item identification and condition grading, (2) market comparables and price estimation, (3) an identity-preserving "AI photo studio", (4) hallucination-resistant listing generation, (5) background jobs with streaming progress in a Next.js app, and (6) the current Anthropic API surface. Anything not confirmed against a first-party source is marked **UNVERIFIED**. Marketplace fee figures come from third-party fee calculators that track first-party fee pages; treat them as "current as of Sept 2026, re-verify before shipping a fee table."

---

## 0. Recommended architecture at a glance

```
[Next.js app] --upload photos--> [Object storage (S3/R2)]
      |                                   |
      | enqueue "ingest_item" job         |
      v                                   v
[Job orchestrator: Inngest (default) or Trigger.dev]
   step 1  identify+grade   -> Claude (claude-sonnet-5 default, claude-opus-5 for low-confidence retry)
                               structured output (output_config.format = json_schema), multi-image prompt
   step 2  barcode/GTIN     -> UPCitemdb / Go-UPC (only if a barcode is visible or user-entered)
   step 3  comps            -> eBay Browse API item_summary/search (active listings; gtin/epid/q + filters)
                               + optional search_by_image (if approved) + category price memory
   step 4  price model      -> deterministic stats (trimmed median/IQR, condition factors, time decay)
   step 5  photo studio     -> BiRefNet (Runpod serverless) or Photoroom -> background gen (Photoroom
                               Image Editing API or Flux Fill/Kontext) -> composite -> C2PA manifest
   step 6  listing copy     -> Claude, grounded on verified attribute JSON; per-marketplace limits
   each step publishes progress -> Inngest Realtime channel -> client `useRealtime` hook (SSE fallback)
[Selling copilot] -> Claude tool use (strict tools) over app data: comps, price model, listing drafts
```

Why this shape: every AI step produces a **typed JSON artifact** that the next step consumes, prices are computed by **deterministic code** (never by the LLM), and the photo pipeline **never regenerates item pixels**. The LLM is the identifier, grader, and writer; the marketplace APIs and statistics are the source of truth for money.

---

## 1. Vision item identification

### 1.1 Claude vision as the primary identifier

Verified against the platform docs (Sept 2026):

- **Input forms**: `image` content blocks with `source.type` = `base64`, `url`, or `file` (`file_id` from `POST /v1/files`). Formats: JPEG, PNG, GIF (first frame), WebP.
- **Limits**: 10 MB per image (base64) on the Claude API; 8000×8000 px max; 32 MB per request; up to 600 images per request on 1M-context models (100 on 200K models). If a request contains **more than 20 images**, a stricter per-image dimension limit applies — resize so neither edge exceeds 2000 px, or keep requests to 20 images or fewer. Practical rule for Clover: **≤ 12 photos per item, pre-resized to ≤ 1568 px long edge**.
- **Token cost**: `ceil(width/28) × ceil(height/28)` visual tokens. Claude 4.7+ models (Opus 5, Sonnet 5, Fable 5.1) are "high-resolution tier": max long edge 2576 px, max 4784 tokens per image. Haiku 4.5 is standard tier (1568 px / 1568 tokens). A 1000×1000 image is 1296 tokens on both tiers; a 3840×2160 photo is 4784 tokens on high-res tier vs 1560 on standard — so **downsample phone photos before upload** or you pay ~3× for fidelity you don't need for identification.
- **Prompt structure**: docs recommend images before text and labelling each one (`Image 1:`, `Image 2:`) so the model can cite them. In later turns Claude still "sees" earlier images without resending them.
- **Files API** avoids resending base64 on every turn of a multi-turn copilot conversation.
- Claude **cannot** name people, cannot reliably detect AI-generated images, and coordinate outputs are approximate (see "Coordinates and bounding boxes" docs if we want defect bounding boxes — treat them as hints, not ground truth).

**Structured output for identification.** Use `output_config.format = { type: "json_schema", schema }` (constrained decoding; the old `output_format` and beta header `structured-outputs-2025-11-13` are transitional; Python SDK 1.x rejects `output_format`). Supported on `claude-opus-5`, `claude-sonnet-5`, `claude-haiku-4-5-20251001`, `claude-fable-5-1`. Schema constraints that matter for us: `additionalProperties: false` required; no `minimum`/`maximum`/`minLength`/`maxLength`/recursive schemas; `enum` and `anyOf` are fine. Compiled grammars are cached 24 h; the injected format system prompt is billed as input tokens. Alternative: define a single `strict: true` tool and let the model call it — but on **Claude Fable 5.1 forced `tool_choice` (`any`/`tool`) returns HTTP 400**, so structured outputs are the portable choice.

Proposed identification schema (conceptual, not code):

```
item: { category_path[], brand, model_or_style, product_name, variant{color,size,capacity,...},
        identifiers{ upc_visible, model_number, serial_partial }, year_or_era }
condition: { grade: enum[new_sealed,new_open,like_new,very_good,good,fair,for_parts],
             functional_unknowns[], defects[]: { type, location, severity: enum, evidence_image: int } }
attributes_verified[]: { name, value, evidence_image: int, confidence: number 0-1 }
attributes_unknown[]: string
confidence: { identity: number, condition: number }
needs_more_photos[]: enum[label_closeup, serial, underside, ports, tag, ...]
```

Design rules that the prompt must enforce:

1. **Evidence citation**: every non-"unknown" attribute must cite the image index it was read from. Attributes the model inferred (not read) go to `attributes_unknown` or carry `confidence < 0.5`.
2. **Confidence scoring**: LLM self-reported confidence is only weakly calibrated; treat it as a **routing signal** — `identity < 0.7` triggers (a) a barcode/GTIN lookup if any code is visible, (b) a second pass on `claude-opus-5` with the top comps' titles as candidate labels, or (c) a "take a photo of the label" prompt to the user. Track calibration by logging confidence vs. user corrections.
3. **Condition vocabulary** is mapped 1:1 to eBay condition IDs (1000 New, 1500 New other, 2000 Certified refurbished, 2500 Seller refurbished, 3000 Used, 7000 For parts/not working — **standard eBay IDs, re-verify per category** since some categories use 4000/5000/6000 grades).

**Cost per identification (4 photos at ~1000×1000 ≈ 5.2K image tokens + ~1.5K prompt + ~0.8K output):** Sonnet 5 ≈ $0.021; Opus 5 ≈ $0.054; Haiku 4.5 ≈ $0.011 (Haiku also gets the cheaper standard-tier image scaling). With a cached system prompt (min 1,024 tokens on Sonnet 5, 512 on Opus 5, 4,096 on Haiku 4.5) the text part drops ~90%.

### 1.2 Google Cloud Vision

- **Product Search** is in **maintenance mode**; Google points to Vision Warehouse for new work. It only searches *your own* product sets, so it is useful only if we build a catalog of previously-identified items — not for open-world identification. No shutdown date published.
- **Web Detection** (`images:annotate` with `WEB_DETECTION`) returns web entities, best-guess labels and visually similar pages: $3.50 / 1,000 images after 1,000 free per month. Label Detection $1.50 / 1,000, Object Localization $2.25 / 1,000. Web Detection is the cheapest legitimate "reverse image search" signal (it returns `bestGuessLabels` like "nike air max 90 infrared") and is a good **pre-filter to feed Claude candidate names**.

### 1.3 Amazon Rekognition

`DetectLabels` is $0.001 / image (first 1M/month). Generic labels ("Shoe", "Sneaker") — too coarse for resale identification. Custom Labels needs a trained model and bills $4 / inference-hour while hosted, which is the wrong cost shape for bursty consumer traffic. **Not recommended** except as a cheap NSFW/moderation gate (`DetectModerationLabels`).

### 1.4 Barcode / UPC lookup

If the photos (or user) provide a UPC/EAN/ISBN, a GTIN lookup is the single highest-precision identification path, and the GTIN can be passed straight into eBay Browse `gtin=` for comps.

| Provider | Pricing (Sept 2026, vendor pages via search) | Notes |
|---|---|---|
| UPCitemdb | Free "Explorer" 100 req/day; paid from $49/mo | `GET https://api.upcitemdb.com/prod/trial/lookup?upc=` (trial) / `/prod/v1/lookup` (paid) |
| Go-UPC | $74.95/mo for 5,000 req; $245 for 45,000; free plan 150 req/mo | `GET https://go-upc.com/api/v1/code/{code}` |
| Barcode Lookup | Pro $99/mo (5,000), Ultra $249/mo (25,000) | `GET https://api.barcodelookup.com/v3/products?barcode=` |

Recommendation: decode the barcode client-side (ZXing/`BarcodeDetector` API) so we only pay for confirmed codes; start with UPCitemdb free tier, cache every response permanently (GTIN → product record) in our DB.

### 1.5 Google-Lens-like reverse image search

- **Bing Visual Search API is gone** — the entire Bing Search API family was retired on **August 11, 2025**; the replacement ("Grounding with Bing Search" for Azure AI Agents) does not return structured visual matches.
- **SerpApi Google Lens API** (`GET https://serpapi.com/search?engine=google_lens&url=<public image url>`) returns `visual_matches[]` with title, link, source, price. Plans: $25/mo for 1,000 searches ($0.025/search) down to ~$0.009/search at 30,000; free tier 250/mo. **Legal status**: Google sued SerpApi in December 2025 (DMCA anti-circumvention claims); reporting indicates a July 2026 ruling went against the DMCA claim and the suit targeted SerpApi's collection methods rather than customers — but the space is unsettled and Google's ToS prohibit automated access. SerpApi's "U.S. Legal Shield" (Production plan and up, up to $2M) covers customers for lawful uses. **Recommendation**: use Lens-via-SerpApi only as an *optional, feature-flagged* fallback for low-confidence identifications, never as a dependency the product cannot ship without, and never store or re-display scraped Google content.
- **eBay's own `search_by_image`** (§2.1) is the marketplace-native equivalent and is legally clean, but access is restricted.

---

## 2. Market comparables and pricing

### 2.1 eBay Browse API (active listings) — the workhorse

Base: `https://api.ebay.com/buy/browse/v1`. Auth: **application access token** (client-credentials grant, scope `https://api.ebay.com/oauth/api_scope`). Header `X-EBAY-C-MARKETPLACE-ID: EBAY_US`. Default quota **5,000 calls/day per application** (raise via eBay's Application Growth Check; check usage with the Analytics API `getRateLimits`).

`GET /item_summary/search`

- Query: `q`, `gtin` (UPC), `epid` (eBay product id), `category_ids` (one per call), `aspect_filter` (needs `categoryId:` prefix), `filter`, `sort`, `fieldgroups`, `limit` (1–200, default 50), `offset` (0–9,999), `auto_correct=KEYWORD`.
- `filter` fields we will use: `conditionIds:{3000|1000}`, `conditions:{USED}`, `price:[20..80]` with `priceCurrency:USD`, `buyingOptions:{FIXED_PRICE|AUCTION|BEST_OFFER}` (FIXED_PRICE only by default), `deliveryCountry:US`, `itemLocationCountry:US`, `sellers:{...}`.
- `sort`: `price`, `-price`, `newlyListed`, `endingSoonest`, `distance` (default Best Match).
- `fieldgroups`: `ASPECT_REFINEMENTS`, `CONDITION_REFINEMENTS`, `CATEGORY_REFINEMENTS`, `BUYING_OPTION_REFINEMENTS`, `EXTENDED` (adds short description + city), `MATCHING_ITEMS`, `FULL`. `CATEGORY_REFINEMENTS` + `ASPECT_REFINEMENTS` are how we discover the dominant category and the item-specific vocabulary for a query — feed both back into the listing generator.
- Response `itemSummaries[]`: `itemId`, `title`, `price{value,currency}`, `condition`, `conditionId`, `buyingOptions[]`, `itemWebUrl`, `image`, `thumbnailImages`, `shippingOptions[].shippingCost`, `itemLocation`, `seller.feedbackPercentage`, `epid`, `categories[]`, `itemCreationDate`, `bidCount`, `currentBidPrice`.

`POST /item_summary/search_by_image` — body `{ "image": "<base64>" }`, same `category_ids`/`filter`/`sort`/`limit` params. Per eBay's docs it is an **experimental method available to select developers approved by business units** — apply early; do not design around it. Image size limits **UNVERIFIED** (the reference page was not fetchable).

`GET /item/{item_id}` (`fieldgroups=PRODUCT`) and `GET /item/get_items_by_item_group` are useful when we need full item specifics (`localizedAspects[]`) of a comp to mine attribute vocabulary.

### 2.2 Sold/completed data — the hard part

- **Finding API `findCompletedItems`** was deprecated in 2020 and the whole Finding API was **decommissioned February 5, 2025**. Any tutorial referencing it is dead.
- **Marketplace Insights API** (`GET https://api.ebay.com/buy/marketplace_insights/v1_beta/item_sales/search`, params `q`/`gtin`/`epid`/`category_ids`/`filter`, last **90 days** of sold items) is a **Limited Release** — application-only since ~2020, and eBay's support matrix says it is "restricted and not open to new users at this time." Plan for **no access at launch**; apply through eBay Developer Program business support anyway and keep the adapter interface ready.
- **Terapeak / Product Research** is free in Seller Hub (up to 3 years of aggregated sold data) but has **no API** and its ToS prohibit scraping. It is a human research tool, not a data source.
- eBay's public "sold listings" filter in web search now sits behind a login wall (2026 reporting), which is why third-party "sold comps" API vendors exist; those are scraping-based — **UNVERIFIED / legal risk**, not recommended as a dependency.

**Implication**: at launch our "sold price" estimate is derived from **active-listing distributions + our own outcome data**. Active asks systematically exceed realized prices; we correct with a category-level *ask-to-sold ratio* that starts from a conservative prior (e.g., 0.85–0.92, UNVERIFIED — calibrate) and is learned from users' actual sales as they report/sync them. Ranking active listings by `newlyListed` and `endingSoonest` and watching which disappear (re-query in 7–14 days) is a legitimate, API-compliant way to build a private sold proxy over time.

### 2.3 Alternative sources by vertical

| Vertical | Source | Access / cost |
|---|---|---|
| Amazon-catalog goods (electronics, books, toys) | Keepa API (`/product`, `/query`) | €49/mo for 20 tokens/min; no free tier; token bucket, unused tokens expire after 60 min |
| Video games, consoles, trading cards | PriceCharting API (`/api/product?t=<token>&q=`) | Requires a paid price-guide subscription; returns loose/CIB/new prices |
| Amazon retail-price anchor | Keepa or PA-API (PA-API requires associate sales) | — |
| Mercari, Poshmark, Depop | **No public seller/search APIs**; crosslisting tools (Vendoo, List Perfectly, Nifty, Closo) automate the web UI | Do not scrape; use as manual-post targets only |
| Facebook Marketplace, OfferUp | No public listing/search APIs | Manual-post targets |

### 2.4 Price estimation method (deterministic, explainable)

Inputs: comps `C = {price_i, shipping_i, condition_i, listed_at_i, similarity_i, source_i}` from Browse (and Insights if ever granted), item condition grade `g`, category `k`.

1. **Similarity gate**: keep comps whose title/aspects match the verified attribute set (brand, model, variant) — score with a cheap embedding or token overlap; drop `similarity < τ`. Ask Claude only to *rank/flag mismatched comps* if `n < 8` (cheap, Haiku).
2. **Landed price**: `p_i = price_i + shipping_i` (buyers compare landed cost; eBay FVF is charged on total incl. shipping anyway).
3. **Outlier trimming**: drop below `Q1 − 1.5·IQR` and above `Q3 + 1.5·IQR`; also drop lots/bundles (title regex "lot of", "bundle", qty>1) and "for parts" unless `g` is for-parts.
4. **Condition normalisation**: map each comp to `g_i`; adjust to the target grade with category-level multipliers `m_k(g_i → g)` (initial prior, UNVERIFIED, e.g. new_sealed 1.00, like_new 0.85, very_good 0.75, good 0.65, fair 0.50, for_parts 0.30 relative to new — learn per category from data).
5. **Time-decay weights**: `w_i = sim_i · exp(−λ·age_days)` with `λ ≈ ln2/45` (45-day half-life; sold data if available gets 2× weight vs. active asks).
6. **Weighted quantiles**: report `P25` as **quick-sale**, `P50` as **recommended**, `P75` as **max-value/patient**. Confidence band = bootstrap over the weighted set; show "low confidence" when `n_eff < 5`.
7. **Ask-to-sold correction** (only when comps are active asks): multiply by `r_k` (§2.2).
8. **Net-out fees** per target marketplace to show *take-home*, and always show the arithmetic.

### 2.5 Fee table for netting (Sept 2026, third-party fee trackers — re-verify against first-party pages)

| Marketplace | Seller fee | Basis | Notes |
|---|---|---|---|
| eBay | **13.6%** + **$0.30** (orders ≤ $10) / **$0.40** (> $10) per order | item + shipping + sales tax | Most categories; some categories differ (e.g., sneakers, guitars, trading cards); promoted listings extra |
| Mercari | **10%** flat | item + buyer-paid shipping | Seller fees returned in 2025 at 10%; the old 2.9% + $0.50 processing fee is gone; buyers pay a separate 3.6% protection fee |
| Poshmark | **$2.95** flat under $15; **20%** at $15+ | item price only | Unchanged for years |
| Facebook Marketplace | **10%** (min $0.80) on shipped checkout orders; **$0** local pickup | item + shipping | No listing fees |
| OfferUp | **12.9%** (min $1.99) on shipped sales; **$0** local | item price (excl. shipping) | Buyer pays shipping |

Net proceeds formula (eBay example): `net = P·(1 − 0.136) − 0.40 − label_cost` where `P` includes buyer-paid shipping. Show per-marketplace net side-by-side; this is the "where should I sell it" feature.

---

## 3. AI photo studio (identity-preserving)

### 3.1 The pattern

**Segment the item → keep its pixels untouched → generate only the background → composite → add shadow/relight → sign.** Marketplaces (and the FTC) require photos to represent the actual item; eBay's picture policy has no AI-specific ban but requires every image to accurately represent the item and bars stock/catalog images for used or defective goods. Any pipeline that *regenerates* the item (Kontext-style "edit this photo") risks altering logos, wear, colours — exactly the details buyers rely on. So generative models are only ever allowed to touch the background layer (plus an optional shadow band), and the original photo is always kept as image #2+.

### 3.2 Building blocks and costs

**Background removal / matting**

| Option | Cost | Notes |
|---|---|---|
| BiRefNet (self-hosted, MIT) | ~$0.0003–0.001 / image compute on Runpod RTX 4090 flex ($1.10/hr, per-second billing) + cold start | Best open-weights quality for hard edges/hair; `rembg` ≥ 2.0 wraps BiRefNet models; run on Runpod Serverless with FlashBoot + network volume ($0.07/GB/mo) for weights |
| Bria RMBG-2.0 | open weights, **commercial use needs a Bria licence** (UNVERIFIED terms) | Comparable quality; check licence before use |
| Photoroom Remove Background API | **$0.02 / image** (+$20/mo plan) | `POST https://sdk.photoroom.com/v1/segment` (endpoint from memory, UNVERIFIED); returns PNG with alpha; also returns shadow options |
| remove.bg | ~$0.20 / image | 10× Photoroom; only if quality demands |
| Stability "Remove Background" | 5 credits = **$0.05** / image | `POST /v2beta/stable-image/edit/remove-background` (path UNVERIFIED) |

**Background generation / inpainting (mask = everything except the item)**

| Option | Cost | Notes |
|---|---|---|
| Photoroom Image Editing API (Plus) `POST https://image-api.photoroom.com/v2/edit` | **$0.10 / image** ($100/mo plan) | One call does cut-out + `background.prompt` (text and/or reference image) + `shadow.mode` (AI shadows with position control) + `lighting.mode` (relight). Purpose-built for product photos; simplest path |
| FLUX.1 Fill [pro] (BFL / fal / Replicate) | **$0.05 / megapixel** output | True mask-based inpaint/outpaint; we pass the inverted alpha as mask so item pixels are locked. Open `FLUX.1-Fill-dev` exists (non-commercial licence) |
| FLUX.1 Kontext [pro]/[max] | $0.04 / $0.08 per image (BFL); $0.055 / $0.11 per MP on some hosts | Instruction-edit model, **no hard mask** → can drift item pixels; use only for background, then re-composite the original cut-out on top |
| Gemini image editing ("nano banana") | Gemini 2.5 Flash Image: $0.039 / image, **deprecated, shutdown Oct 2, 2026** → `gemini-3.1-flash-image`: $0.045 (0.5K), $0.067 (1K), $0.101 (2K), $0.151 (4K), up to 14 reference images; batch mode ~half | Excellent scene realism, no mask → same "re-composite the cut-out" rule |
| OpenAI `POST /v1/images/edits` | `gpt-image-1` **deprecating Oct 23, 2026** → `gpt-image-1.5`: $0.009 / $0.034 / $0.133 per 1024² (low/med/high) + input-image tokens | Accepts a `mask` PNG; medium quality is the sweet spot |
| Google Imagen 3 on Vertex (`imagen-3.0-capability-001`) | ~$0.02 / edit (third-party figure, UNVERIFIED) | Mask-based inpaint/outpaint, background mask mode, product-image editing |
| Stability Inpaint / Search-and-Replace / Replace-Background-and-Relight | 5 credits = $0.05 | `POST /v2beta/stable-image/edit/inpaint` etc. (paths UNVERIFIED) |

**Relighting / shadows**: Photoroom's `lighting.*` and `shadow.*`; IC-Light **v1 is commercially usable, v2 (Flux-based) is non-commercial** without a licence (fal.ai offers hosted commercial access). Relighting *does* alter item pixels — treat it like a filter, keep it subtle, and never apply it to defect close-ups.

### 3.3 Recommended pipeline

1. **Ingest**: normalise EXIF orientation, downscale to 2048 px long edge, strip GPS metadata.
2. **Segment** (BiRefNet on Runpod; Photoroom as managed fallback). Store the alpha matte; reject if the matte covers < 5% or > 95% of the frame (bad photo → ask user to reshoot).
3. **Hero image**: composite cut-out onto a clean studio background (solid white/light grey gradient rendered locally — **zero AI cost**, marketplace-preferred, eBay's own guidance favours plain backgrounds). This is the default output.
4. **Optional lifestyle background** (user-selected style): generate with Photoroom `v2/edit` (one call, ~$0.10) or Flux Fill (~$0.05–0.10) using the inverted matte as the mask; **always re-composite the original cut-out over the result** so item pixels are byte-identical to the segmented original.
5. **Shadow**: Photoroom AI shadow, or a synthetic contact shadow (blurred, offset alpha silhouette) rendered locally.
6. **Provenance**: write a C2PA manifest (§3.4) and set an `ai_generated_background=true` flag in our DB; keep the original photo as the first gallery image for used items.
7. **QA gate**: run Claude (Haiku 4.5) on {original, output} with a yes/no schema — "same item, same defects visible, no added/removed features?" — and discard on failure. Cost ≈ $0.005.

Per-item cost at 6 photos: segmentation ≈ $0.006 (self-hosted) or $0.12 (Photoroom); one lifestyle hero ≈ $0.10; QA ≈ $0.03. **Total ≈ $0.15–0.30 per item**, or ~$0.02 if the user only takes the free studio-white path.

### 3.4 C2PA content credentials and labelling

- C2PA spec **2.2**: a manifest = assertions + claim + signature (COSE_Sign1 over CBOR, X.509 cert with the `c2pa-kp-claimSigning` EKU, optional RFC 3161 timestamp). For our outputs: `c2pa.actions` with `c2pa.placed` (item cut-out placed) and `c2pa.edited`, and `digitalSourceType = http://c2pa.org/digitalsourcetype/compositeWithTrainedAlgorithmicMedia` for AI backgrounds. Tooling: `c2pa-node` (Node 22+, merged into the `c2pa-js` monorepo June 2026), `c2patool` CLI, `c2pa-rs`.
- Regulatory: **EU AI Act Article 50** transparency obligations apply from **August 2, 2026** — providers of systems generating synthetic images must mark outputs in a machine-readable way; a C2PA manifest is the accepted mechanism. eBay's public policies (as of Aug 2026) do **not** require per-photo AI disclosure, but accuracy rules apply and marketplaces are inserting their own AI edits (eBay has tested AI fashion models on seller images), so provenance metadata is becoming table stakes.
- Caveat: most marketplaces **strip metadata on upload**, so C2PA protects us (audit trail, EU compliance) more than it informs buyers. Add a subtle visible "AI background" badge option in-app and disclose in the listing description template ("Background digitally replaced; item photos unedited").

---

## 4. Listing generation with LLMs

### 4.1 Grounding contract

The listing generator receives **only** the verified artifact from §1 plus comps vocabulary from §2, never raw photos, and is bound by these prompt rules:

1. **Closed-world facts**: "Use only attributes in `attributes_verified`. Anything else must be phrased as unknown or omitted. Do not infer materials, sizes, years, authenticity, or included accessories."
2. **Unknown handling**: render `attributes_unknown` as explicit buyer-facing lines ("Size tag not legible — see photo 3") rather than silence; this both reduces returns and mirrors eBay's item-specifics UX where "Unknown"/"Does not apply" are legal values.
3. **Defect disclosure block** is mandatory and generated verbatim from `condition.defects[]` (severity + location + photo reference). The model may reorder but not soften.
4. **Schema-locked output** via `output_config.format`: `{ title, subtitle?, description_markdown, item_specifics: [{name, value}], hashtags[] }` per marketplace, with the app enforcing limits post-hoc (constrained decoding cannot enforce `maxLength`).
5. **Self-check pass** (cheap, Haiku 4.5): "List every factual claim in this listing; mark any not present in the attribute JSON." Reject listings with unsupported claims — this is the hallucination tripwire.
6. **Comps-derived keywords** come from Browse `ASPECT_REFINEMENTS` and top comp titles — the model may use them as *search terms* only if consistent with verified attributes.

### 4.2 Marketplace field limits

| Marketplace | Title | Description | Structured fields | Source status |
|---|---|---|---|---|
| eBay | **80 chars** | up to 500K chars (HTML allowed; keep mobile-first text) | Item specifics: required/recommended per category via Taxonomy API `GET /commerce/taxonomy/v1/category_tree/{tree_id}/get_item_aspects_for_category?category_id=`; aspect values max 65 chars; condition + `conditionDescription` | eBay dev docs (verified) |
| Mercari (US) | **80 chars** (mobile truncates ~40–50; some sources say 40 — **UNVERIFIED**, likely older/JP limit) | **1,000 chars** | 3 hashtags; brand/size/condition pickers | third-party guides |
| Poshmark | **50 chars** (one source says 80 — **UNVERIFIED**) | **500 chars** (a 1,500 figure also circulates — **UNVERIFIED**) | brand, size, category, colour, "New with tags" | third-party guides |
| Facebook Marketplace | **100 chars** | **5,000 chars**; mobile shows ~200 before "See more" (a March 2026 report says only ~63 chars visible in some surfaces) | category, condition, brand, colour | third-party guides |
| OfferUp | **UNVERIFIED** (help centre only says "keep titles concise") | **UNVERIFIED** | category, condition, brand, model | help centre lacks numbers |

Generator strategy: produce the eBay version first (richest), then derive the others via **deterministic transforms** where possible (truncate to N chars at a word boundary, strip HTML, drop item-specifics table) and only call the LLM again for tone/length-sensitive rewrites.

### 4.3 Tone-transform tools

Expose Claude tools (or plain prompts) such as `rewrite(tone: enum[neutral, friendly, premium, minimal], length: enum[short, standard, long])`, `shorten_title(max_chars)`, `add_measurements(measurements{})`, `translate(locale)`. Every transform re-runs the self-check pass; transforms may never add facts. Use `claude-sonnet-5` for drafts (≈ $0.01 per full listing with caching), `claude-haiku-4-5` for checks and truncations.

---

## 5. Background jobs and streaming progress UI

### 5.1 Why not "just await it in the route handler"

Vercel functions default to a **300 s** max duration (up to 800 s on Pro/Enterprise; 1,800 s in beta on Node), and `waitUntil()` is still bounded by that limit. The ingest pipeline (identification → comps → photos → copy) is 30–120 s with several external calls that fail independently, so it needs **durable steps with retries**, not a long HTTP request.

### 5.2 Options

| Option | Model | Progress to UI | Fit |
|---|---|---|---|
| **Inngest** (recommended) | Functions run inside our Next.js deployment; cloud (or self-hosted) orchestrator persists each `step.run` and resumes after failures; concurrency, throttling, fan-out | **Realtime**: `step.realtime.publish()` (durable, memoised) for state transitions; `inngest.realtime.publish()` (non-durable) for high-frequency ticks/tokens; channels (per item/user) + typed topics; client `useRealtime` from `inngest/react` with server-minted subscription tokens scoped to a channel + topics | Zero-infra, generous free tier, natural per-step progress model |
| **Trigger.dev** | Tasks run on Trigger's workers (or self-hosted); Realtime built on Electric SQL (HTTP Postgres sync); `metadata.set()` for progress, `streams.define()` + `useRealtimeStream` for LLM tokens, `useRealtimeRun` for status | Excellent dashboard/debugging; good if we want long-running (>15 min) work like batch re-pricing | Strong alternative; slightly more vendor surface |
| **BullMQ** | Redis-backed queue, persistent workers, flows (parent/child), rate limits | DIY: workers publish to Redis pub/sub → SSE route | Cheapest at scale (~1M jobs/day), but we must run Redis + workers |
| **pg-boss** (v10/v11) | Postgres-only queue using `SKIP LOCKED`; per-queue partitioned tables, dead-letter queues, cron, dashboard package | DIY via `LISTEN/NOTIFY` → SSE | Great if we already run Postgres and stay under ~1k jobs/hour |

Recommendation: **Inngest** for the ingest pipeline and scheduled re-pricing (cron), with the job-step names mirrored 1:1 to UI stages. Keep the step boundary contract in our own code so a later move to Trigger.dev/pg-boss is mechanical.

### 5.3 Streaming patterns

- **Step progress** (coarse): Inngest Realtime → `useRealtime`. Fallback for environments without it: a Next.js Route Handler returning a `ReadableStream` with `text/event-stream` (SSE), polling job state from the DB every ~1 s; SSE works through every proxy/CDN, and we must handle client abort signals and server timeouts.
- **Streaming structured objects** (fine-grained, e.g., watching the identification JSON fill in): Vercel **AI SDK v7** — `streamText({ model: anthropic('claude-sonnet-5'), output: Output.object({ schema }) })` and iterate `partialOutputStream`; on the client, `useObject` from `@ai-sdk/react`. `streamObject` still appears in the docs; the "generating structured data" guide now centres on `Output.object()` — treat `streamObject` as legacy (**UNVERIFIED** whether formally deprecated). Because the AI SDK's Anthropic provider maps to the Messages API, prompt caching and image inputs work through it; but for the *structured-output-constrained* identification call we should use the Anthropic SDK directly to pass `output_config.format` (the AI SDK's JSON mode may use tool-based emulation — **UNVERIFIED** for v7).
- **Selling copilot** (chat over app data): Claude tool use with `strict: true` tools such as `get_item(item_id)`, `get_comps(item_id, filters)`, `get_price_model(item_id)`, `draft_listing(item_id, marketplace, tone)`, `set_price(item_id, price)` (the last requires an explicit confirmation step in the UI). Run the loop with the SDK's beta tool runner or a manual loop; stream with `eager_input_streaming: true` on client tools; on Fable 5.1 do not use forced `tool_choice` (400). Use prompt caching on the tool definitions + system prompt (place volatile item data after the last breakpoint). Use `claude-opus-5` for the copilot (reasoning over price trade-offs), `claude-sonnet-5` for bulk generation.

---

## 6. Anthropic API specifics (verified against platform.claude.com, Sept 2026)

Note: `docs.anthropic.com` now 301-redirects to `platform.claude.com/docs`.

### 6.1 Current models and pricing (per MTok)

| Model | ID | Context / max output | Input | Output | 5m cache write | 1h write | Cache read | Batch in/out |
|---|---|---|---|---|---|---|---|---|
| Claude Fable 5.1 | `claude-fable-5-1` | 1M / 128K | $10 | $50 | $12.50 | $20 | **$0.25** (0.025×) | $5 / $25 |
| Claude Opus 5 | `claude-opus-5` | 1M / 128K | $5 | $25 | $6.25 | $10 | $0.50 | $2.50 / $12.50 |
| Claude Sonnet 5 | `claude-sonnet-5` | 1M / 128K | $2 | $10 | $2.50 | $4 | $0.20 | $1 / $5 |
| Claude Haiku 4.5 | `claude-haiku-4-5-20251001` (alias `claude-haiku-4-5`) | 200K / 64K | $1 | $5 | $1.25 | $2 | $0.10 | $0.50 / $2.50 |

- Sonnet 5's $2/$10 "introductory" price is now permanent (the Sept 1, 2026 increase was cancelled).
- Claude 4.7+ tokenizer produces ~30% more tokens than Sonnet 4.6-era models for the same text — re-baseline token estimates with `POST /v1/messages/count_tokens`.
- Fable 5.1: thinking is always on (omit `thinking` or send `{type:"adaptive"}`); control cost with `output_config.effort` (`low`…`max`); forced `tool_choice` returns 400; handle `stop_reason: "refusal"` (use the server-side `fallbacks` beta); requires 30-day data retention (not ZDR); retirement not before Sept 1, 2027. Haiku 4.5 retirement not before Oct 15, 2026 — **plan a Haiku successor swap**.
- Opus 5 / Sonnet 5: adaptive thinking; `budget_tokens` and assistant prefill are rejected — use structured outputs instead of prefill for JSON.

### 6.2 Feature surface we depend on

- **Vision**: §1.1 (limits, token formula, high-res tier).
- **Structured outputs**: `output_config.format` JSON schema (GA), `strict: true` tools; unsupported schema keywords listed in §1.1.
- **Prompt caching**: `cache_control: {type:"ephemeral"}` at top level (automatic) or per block (max 4 breakpoints); min cacheable prefix 512 tokens (Fable 5.1, Opus 5), 1,024 (Sonnet 5), 4,096 (Haiku 4.5); 5-min TTL default, `ttl: "1h"` at 2× write; images are cacheable but adding/removing any image invalidates the prefix; verify via `usage.cache_read_input_tokens`.
- **Message Batches**: `POST /v1/messages/batches`; 50% off everything; ≤ 100,000 requests or 256 MB per batch; most finish < 1 h, 24 h max; results retrievable 29 days; supports vision and tool use; caching stacks (best-effort hit rate). Use for nightly re-identification/re-pricing and eval runs, never for the interactive path.
- **Files API**: `POST /v1/files` → `file_id` for images reused across turns.
- **Web search tool** (`web_search_20260209`): $10 per 1,000 searches — a possible fallback for obscure-item identification, cheaper than SerpApi but not image-based.
- **Models API**: `GET /v1/models/{id}` returns `max_input_tokens`, `max_tokens`, `capabilities` — use at boot to validate configured model IDs.

### 6.3 Model routing for Clover

| Task | Model | Why |
|---|---|---|
| Identification + grading (interactive) | `claude-sonnet-5`; escalate to `claude-opus-5` when `confidence.identity < 0.7` | 2.5× cheaper than Opus; escalation only on ~20–30% of items |
| Listing drafts | `claude-sonnet-5` | quality/cost |
| Self-check, QA gates, truncations, comp-mismatch flags | `claude-haiku-4-5` | $1/$5, standard-tier image cost |
| Selling copilot | `claude-opus-5` (adaptive thinking, effort `medium`) | multi-step reasoning over tools |
| Nightly re-pricing / evals | Batch API on Sonnet 5 / Haiku 4.5 | 50% off |
| Fable 5.1 | not in the default path | $10/$50 is not justified for per-item work; consider for eval-judging or hard disputes |

Estimated AI cost per fully processed item (identify + comps flagging + one listing + checks, with caching): **≈ $0.04–0.08**, plus photo studio ≈ $0.02–0.30 depending on options.

---

## 7. Endpoint cheat-sheet

| Purpose | Endpoint |
|---|---|
| Claude messages | `POST https://api.anthropic.com/v1/messages` (`anthropic-version: 2023-06-01`) |
| Claude batches | `POST /v1/messages/batches`, `GET /v1/messages/batches/{id}`, `GET /v1/messages/batches/{id}/results` |
| Claude files / token count / models | `POST /v1/files`, `POST /v1/messages/count_tokens`, `GET /v1/models` |
| eBay app token | `POST https://api.ebay.com/identity/v1/oauth2/token` (grant_type=client_credentials, scope `https://api.ebay.com/oauth/api_scope`) |
| eBay active comps | `GET https://api.ebay.com/buy/browse/v1/item_summary/search` |
| eBay image search (restricted) | `POST https://api.ebay.com/buy/browse/v1/item_summary/search_by_image` |
| eBay item detail | `GET https://api.ebay.com/buy/browse/v1/item/{item_id}` |
| eBay sold comps (restricted) | `GET https://api.ebay.com/buy/marketplace_insights/v1_beta/item_sales/search` |
| eBay item specifics schema | `GET https://api.ebay.com/commerce/taxonomy/v1/category_tree/{tree_id}/get_item_aspects_for_category?category_id=` |
| eBay quota | Analytics API `GET /developer/analytics/v1_beta/rate_limit/` |
| Google Vision | `POST https://vision.googleapis.com/v1/images:annotate` (`WEB_DETECTION`, `LABEL_DETECTION`) |
| UPC lookups | `GET https://api.upcitemdb.com/prod/v1/lookup?upc=`, `GET https://go-upc.com/api/v1/code/{code}` |
| SerpApi Lens (optional) | `GET https://serpapi.com/search?engine=google_lens&url=` |
| Photoroom | `POST https://image-api.photoroom.com/v2/edit` (Plus); `POST https://sdk.photoroom.com/v1/segment` (Basic, UNVERIFIED path) |
| Flux Fill | `POST https://api.bfl.ml/v1/flux-pro-1.0-fill` (UNVERIFIED path; fal/Replicate mirrors) |
| OpenAI image edits | `POST https://api.openai.com/v1/images/edits` (`model: gpt-image-1.5`, `mask`) |
| Gemini image | `generateContent` with `gemini-3.1-flash-image` |
| Runpod serverless | `POST https://api.runpod.ai/v2/{endpoint_id}/runsync` / `/run` + `/status/{id}` |

---

## 8. Open items / UNVERIFIED list

1. eBay `search_by_image` approval process, image size limit, marketplace coverage.
2. Marketplace Insights access — apply; assume denied.
3. Mercari (40 vs 80 title), Poshmark (500 vs 1,500 description), OfferUp limits — confirm by creating test listings.
4. Fee percentages: confirm on eBay/Mercari/Poshmark/Meta/OfferUp first-party fee pages before publishing a net-proceeds calculator; category exceptions on eBay.
5. Photoroom `v1/segment`, Stability `/v2beta/stable-image/edit/*`, BFL `flux-pro-1.0-fill` exact paths — confirm from vendor OpenAPI specs.
6. Bria RMBG-2.0 and FLUX Fill-dev licences for commercial use.
7. Whether AI SDK v7 uses native `output_config.format` for Anthropic structured output or tool-emulation.
8. Initial condition multipliers and ask-to-sold ratio priors — calibrate from our own outcome data.
9. Haiku 4.5 successor (retirement floor Oct 15, 2026).

---

## Sources

Anthropic (platform.claude.com):
- https://platform.claude.com/docs/en/docs/build-with-claude/vision
- https://platform.claude.com/docs/en/docs/build-with-claude/structured-outputs
- https://platform.claude.com/docs/en/docs/build-with-claude/prompt-caching
- https://platform.claude.com/docs/en/docs/build-with-claude/batch-processing
- https://platform.claude.com/docs/en/docs/about-claude/pricing
- https://platform.claude.com/docs/en/docs/about-claude/models/overview

eBay:
- https://github.com/numerogeek/ebay-browse-api/blob/master/docs/Api/ItemSummaryApi.md (Browse API parameter reference mirror; developer.ebay.com blocked automated fetch)
- https://www.edp.ebay.com/api-docs/buy/browse/resources/item_summary/methods/searchByImage
- https://developers.ebay.com/api-docs/buy/browse/resources/search_by_image/methods/searchByImage (via search snippet: "experimental method available to select developers")
- https://developer.ebay.com/api-docs/commerce/taxonomy/resources/category_tree/methods/getItemAspectsForCategory
- https://developer.ebay.com/develop/get-started/api-call-limits
- https://community.ebay.com/t5/Traditional-APIs-Search/Alert-Finding-API-and-Shopping-API-to-be-decommissioned-in-2025/td-p/34222062
- https://forums.developer.ebay.com/questions/37466/findcompleteditems-dropped-from-finding-api.html
- https://community.ebay.com/forum/talk-to-your-fellow-developers-57970/topic/marketplace-insights-api-access-168586/
- https://scavio.dev/blog/ebay-sold-listings-api-login-wall-2026
- https://sold-comps.com/alternatives
- https://export.ebay.com/en/resources/important-updates/ebay-news-archive/terapeak
- https://www.listing-forge.com/blog/ebay-character-limits
- https://developer.ebay.com/api-docs/user-guides/static/trading-user-guide/item-specifics.html

Marketplace fees and limits (third-party trackers):
- https://taxomate.com/blog/ebay-seller-fees
- https://sellerfeecalc.com/ebay-fees
- https://www.voolist.com/blog/mercari-fees-2026
- https://nifty.ai/post/mercari-fees
- https://sellerfeecalc.com/calculators/poshmark
- https://crosslist.com/blog/poshmark-selling-fees
- https://sellerfeecalc.com/seller-fees/facebook
- https://www.underpriced.app/blog/facebook-marketplace-fees-2026
- https://closo.co/blogs/fees/offerup-fees
- https://www.underpriced.app/blog/offerup-selling-guide-2026
- https://quicklistai.org/listing-titles-that-rank/
- https://poshsidekick.com/how-to-craft-perfect-titles-for-poshmark-listings/
- https://makingamark.blogspot.com/2026/03/facebook-now-only-allows-63-characters-for-visible-description.html
- https://help.offerup.com/hc/en-us/articles/360032334651-How-to-create-a-great-listing
- https://nifty.ai/post/mercari-cross-listing

Other data sources:
- https://keepa.com/api-docs/plans-tokens.html
- https://revenuegeeks.com/software/keepa/api
- https://www.pricecharting.com/api-documentation
- https://www.upcitemdb.com/api/
- https://go-upc.com/plans
- https://www.barcodelookup.com/api
- https://serpapi.com/google-lens-api
- https://serpapi.com/pricing
- https://serpapi.com/us-legal-shield
- https://ipwatchdog.com/2025/12/26/google-sues-serpapi-parasitic-scraping-circumvention-protection-measures/
- https://www.octoparse.com/blog/is-serpapi-legal
- https://learn.microsoft.com/en-us/lifecycle/announcements/bing-search-api-retirement
- https://cloud.google.com/vision/pricing
- https://docs.cloud.google.com/vision/product-search/docs
- https://docs.cloud.google.com/vision/docs/deprecations
- https://aws.amazon.com/rekognition/pricing/

Photo studio:
- https://www.photoroom.com/api/pricing
- https://docs.photoroom.com/image-editing-api-plus-plan/which-endpoints-are-available
- https://docs.photoroom.com/changelog
- https://www.remove.bg/pricing
- https://platform.stability.ai/pricing
- https://developer.puter.com/tutorials/stability-ai-api-pricing/
- https://bfl.ai/flux-1-tools/
- https://fal.ai/models/fal-ai/flux-pro/v1/fill
- https://pricepertoken.com/flux-pricing
- https://ai.google.dev/gemini-api/docs/pricing
- https://openrouter.ai/google/gemini-3.1-flash-image
- https://www.aifreeapi.com/en/posts/gemini-flash-image-generation-pricing
- https://pricepertoken.com/gpt-image-pricing
- https://costgoat.com/pricing/openai-images
- https://intuitionlabs.ai/articles/ai-image-generation-pricing-google-openai
- https://github.com/ZhengPeng7/BiRefNet
- https://huggingface.co/briaai/RMBG-2.0
- https://github.com/lllyasviel/IC-Light/blob/main/LICENSE
- https://fal.ai/models/fal-ai/iclight-v2
- https://www.runpod.io/pricing
- https://docs.runpod.io/serverless/pricing
- https://spec.c2pa.org/specifications/specifications/2.2/specs/C2PA_Specification.html
- https://github.com/contentauth/c2pa-node
- https://opensource.contentauthenticity.org/docs/sdk-repos/c2pa-js/packages/c2pa-node/
- https://ai-solutions.daviesmeyer.com/en/blog/c2pa-content-credentials-ki-kennzeichnung
- https://masonry.so/blog/ebay-ai-product-photos-rules
- https://nightjar.so/help-desk/does-ebay-allow-ai-generated-product-photos-in-listings
- https://www.valueaddedresource.net/ebay-tests-ai-fashion-models-alters-images/

Jobs and streaming:
- https://www.inngest.com/docs/features/realtime
- https://trigger.dev/docs/realtime/overview
- https://github.com/timgit/pg-boss
- https://www.buildmvpfast.com/blog/inngest-vs-trigger-dev-vs-bullmq-background-jobs-nextjs-2026
- https://www.pkgpulse.com/guides/best-nodejs-background-job-libraries-2026
- https://vercel.com/docs/functions/configuring-functions/duration
- https://dev.to/ahmed_mahmoud360/background-jobs-on-vercel-in-2026-field-notes-on-waituntil-queues-workflow-and-cron-1l6g
- https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data
- https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-object
- https://nextjs.org/docs/app/guides/streaming
- https://dev.to/pavelespitia/building-a-real-time-progress-bar-with-server-sent-events-in-nextjs-2a6f
