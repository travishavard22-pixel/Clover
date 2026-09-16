# Clover — Brand Identity

> Working brand for the AI resale platform. Everything here is deliberately opinionated so the
> product can be built against it; it can be revised later without touching the token names.

## 1. Name

**Clover.**

Why it works for this product:

- A four-leaf clover is the universal symbol for *finding something valuable that was hiding in
  plain sight* — which is literally what the product does to the contents of a closet or garage.
- Four leaves → four launch marketplaces (eBay, Facebook Marketplace, OfferUp, Nextdoor). The mark
  is built from that idea (see §3).
- It is a real word, short, pronounceable, memorable, and has none of the "-ify / -ly / AI-suffix"
  signals of a generic AI startup. It reads like a consumer brand, not a tool.
- Green is the colour of money and growth without needing a dollar sign anywhere.

Tagline system (use one at a time, never stacked):

| Context | Line |
|---|---|
| Primary | **Photograph it. It's for sale.** |
| App store / hero | **Point. Price. Sold.** |
| Explainer | *Clover turns a photo into a priced, written, photographed listing on every marketplace you use — and keeps it sold only once.* |
| Empty states | *What are you selling?* |

Voice: **calm, precise, quietly confident.** Clover never hypes. It says what it knows, says what
it doesn't, and tells you what to do next. Sentences are short. Numbers are exact. Estimates are
labelled as estimates.

Words we use: *scan, listing, estimate, evidence, comps, take-home, publish, sold.*
Words we avoid: *magic, magical, supercharge, AI-powered (in UI), leverage, seamless, hassle-free.*

## 2. Brand personality

| Trait | Expression in product |
|---|---|
| **Editorial** | Generous whitespace, large photography, one accent, serif used only at emotional moments. |
| **Honest** | Confidence tiers on every AI field, evidence on tap, AI imagery labelled, limitations stated up front. |
| **Fast** | Nothing waits for everything; results stream in seller order; keyboard-first on desktop. |
| **Tactile** | Border-first elevation, real shadows only on things that float, snap/settle springs on capture and reveal. |
| **Premium** | Near-monochrome chrome, tabular figures for money, tight display tracking, no gradients or sparkles. |

Reference points (for taste, not imitation): Linear (restraint, token system), Family wallet
(motion), Aesop / Kinfolk (editorial photography and serif), Apple Photos (image viewer), Notion
(inline AI as a layer, not a chat box).

## 3. Logo and wordmark

**Symbol: the "Aperture Clover".** Four identical rounded leaves arranged around a centre, each
leaf drawn as a camera-aperture blade (a rounded quadrilateral with one straight inner edge).
Rotated 45°, the negative space in the centre forms a small square — the viewfinder. Read
literally: *a camera that grows into four marketplaces.*

Construction rules (SVG in `apps/web/public/brand/clover-mark.svg`):

- Built on a 24-unit grid. Leaves are 10×10 rounded rectangles (radius 4) offset 5 units from
  centre, rotated 45°. Centre square is 3×3 negative space.
- Single colour. Never gradient. Never with a drop shadow.
- Minimum size 16 px (favicon). At ≤ 20 px the centre square is removed.
- Clear space = height of one leaf on all sides.

**Wordmark:** "clover" set in lowercase Inter Display (weight 600, tracking −0.035em), leading
cap height aligned to the symbol's centre square. Lowercase is deliberate: friendlier than a
tech-uppercase mark and it keeps the counters open at small sizes.

Lock-ups: symbol-left (default), symbol-only (app icon, favicon, avatar), stacked (splash).

App icon: symbol in Paper on a Clover-green tile with a 22% corner radius. Dark tile variant for
monochrome/tinted iOS icons.

## 4. Colour system

One accent colour. Chrome is near-monochrome. **The seller's photographs are the colour.**

All colours are defined in OKLCH so the light and dark themes are derived, not hand-picked. The
canonical tokens live in `packages/design-tokens/tokens.css`; the values below are the sources.

### 4.1 Core palette

| Token | OKLCH | Hex (sRGB) | Role |
|---|---|---|---|
| `--clover-ink` | `oklch(0.17 0.01 120)` | `#141613` | Primary text (light), base surface (dark) |
| `--clover-paper` | `oklch(0.975 0.005 90)` | `#F8F7F3` | Base surface (light), primary text (dark) |
| `--clover-green` | `oklch(0.52 0.13 152)` | `#1E7A4C` | **Accent**: primary actions, focus ring, links, active states |
| `--clover-green-deep` | `oklch(0.40 0.11 152)` | `#0F5433` | Accent hover / pressed |
| `--clover-green-soft` | `oklch(0.94 0.04 152)` | `#DDF2E6` | Accent tint backgrounds (light) |
| `--clover-moss` | `oklch(0.72 0.11 148)` | `#6DBC8B` | Accent on dark surfaces (meets 4.5:1 on ink) |

### 4.2 Neutral ramp (warm, low-chroma)

Twelve steps from Paper to Ink, generated at chroma 0.006 hue 90 (warm) so greys never look
blue. Steps: `--n-0 … --n-11`. Light theme surfaces use 0–3, borders 4–5, muted text 7–8, text 11.
Dark theme inverts the ramp with a **soft near-black base** (`--n-11` = `oklch(0.19 …)`, not pure
black) and four surface tiers (base, raised, overlay, floating) at +0.03 L each.

### 4.3 Semantic colours (never used decoratively)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--success` | `oklch(0.55 0.14 150)` | `oklch(0.75 0.13 150)` | Published, sold, verified |
| `--warning` | `oklch(0.72 0.15 75)` | `oklch(0.80 0.14 80)` | Needs attention, needs check, stale |
| `--danger` | `oklch(0.55 0.19 27)` | `oklch(0.72 0.17 25)` | Failed, destructive, defect |
| `--info` | `oklch(0.55 0.10 250)` | `oklch(0.75 0.09 250)` | Estimate / AI-derived (informational) |

Confidence tiers map to these deliberately: **Confident** = success, **Likely** = info,
**Needs check** = warning. Every AI-generated field carries a tier, never a bare number (numeric
confidence appears in the expert toggle).

### 4.4 Contrast guarantees

Text ≥ 4.5:1, UI components ≥ 3:1 in both themes (checked by `scripts/check-contrast.mjs` in CI).
Text over photographs always sits on a scrim (`--scrim: oklch(0.15 0.01 120 / 0.55)`).

## 5. Typography

| Role | Face | Notes |
|---|---|---|
| UI + display | **Inter** (variable, self-hosted via `@fontsource-variable/inter`) | `font-feature-settings: "cv11", "ss01", "tnum"` on numbers; `font-optical-sizing: auto`. Display sizes ≥ 32 px use tracking −0.02 to −0.035em. |
| Editorial | **Instrument Serif** (`@fontsource/instrument-serif`) | Only at the analysis reveal ("It's a Leica M6."), onboarding welcome, empty states, and the sold moment. Never for body or UI. |
| Code / SKU / IDs | **JetBrains Mono** (`@fontsource-variable/jetbrains-mono`) | SKUs, item IDs, API references. |

Type scale (rem, 4-px baseline): 12 / 13 / 14 / 16 / 18 / 22 / 28 / 36 / 48 / 64. Body is 16 on
mobile and 15 on desktop density "compact". Line-height 1.5 body, 1.15 display. Money is always
set in tabular figures and never wraps.

## 6. Spacing, radius, elevation

- **Unit 4 px.** Scale: 1,2,3,4,6,8,12,16,20,24,32 (× 4 px). Phone gutters 16 px; tablet 24;
  desktop content width ≤ 1280 px.
- **Radius:** 6 (inputs, chips), 10 (cards), 14 (sheets), 20 (modals/photos), full (pills).
  Photos use 10 in grids, 0 in the viewer.
- **Elevation is border-first.** Surfaces separate by a 1-px border (`--n-4`) and background
  tier, not shadow. Shadows exist only for things that float: menus, toasts, the capture shutter,
  the drag ghost. Two shadow tokens: `--shadow-float`, `--shadow-lift`.

## 7. Iconography

Lucide (stroke 1.75 at 20 px, 1.5 at 24 px), monochrome, currentColor. Custom glyphs only for the
mark, marketplace logos (official assets, unaltered, used only where the platform's brand
guidelines allow) and the confidence tier dots. No filled/duotone mixes. No emoji in UI chrome.

## 8. Motion language

Codified from the research (Emil Kowalski standards, M3, Family):

| Token | Value | Use |
|---|---|---|
| `--ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | Enter / most UI |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | Move / morph |
| `--dur-fast` | 120 ms | Hover, toggles, chips |
| `--dur-base` | 200 ms | Sheets, menus, fades |
| `--dur-slow` | 300 ms | Page transitions, cards morphing |
| Spring "settle" | stiffness 380, damping 34, bounce ≤ 0.2 | Capture shutter, photo snap-to-grid |
| Spring "reveal" | stiffness 220, damping 26 | **The one expressive spring**: the analysis reveal |

Rules: transform/opacity only; stagger 30–80 ms; ≤ 300 ms for functional UI; **zero animation for
keyboard-initiated and high-frequency actions**; `prefers-reduced-motion` = crossfades and
instant layout, never "nothing happens". Every animation communicates state (where something
came from, where it went, what changed) — decoration is not a reason.

Signature moments (the whole "novelty budget"):

1. **Capture** — shutter press: scale 0.96 → 1 with the settle spring; thumbnail flies to the
   tray.
2. **Analysis** — checklist lines resolve top to bottom as real steps finish; the item name
   arrives in Instrument Serif with the reveal spring; the price counts up in tabular figures
   over 600 ms.
3. **Publish** — per-marketplace rows flip from "Publishing" to "Published" with a single
   success tick; no confetti.
4. **Sold** — the item card desaturates to a tasteful "Sold" state and the take-home figure
   settles into the revenue tile.

## 9. Photography direction

- Item images dominate: cards are ≥ 60% image. Chrome recedes.
- Studio outputs default to warm off-white (`--clover-paper`) backgrounds with a soft contact
  shadow — matches the UI so listings look "native" inside Clover.
- AI-stylised images always show an **"AI background"** badge in-app and are never the first
  gallery image for used goods.
- Condition photos are never enhanced beyond exposure/white balance; defects are highlighted with
  a thin ring, never hidden.

## 10. Accessibility commitments (brand-level)

WCAG 2.2 AA is the floor: 24 px minimum targets, drag alternatives for every drag interaction,
focus never obscured by sticky bars, live regions for streamed analysis, reduced-motion respected,
all colour meaning duplicated by text or icon.
