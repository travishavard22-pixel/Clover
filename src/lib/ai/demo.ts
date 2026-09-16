import { imageHash } from "../images";
import { catalogByHash, matchCatalogByHints, matchCatalogByProfile, type DemoCatalogEntry } from "../demo/catalog";
import { conditionLines, includedLines, parseDescription, renderDescription, shippingLine, stripOtherMarketplaceNames, unknownLines, type DescriptionModel } from "../listings/compose";
import { checkListingClaims, type Facts } from "../listings/self-check";
import { applyLength, applyTone, dedupe, type TransformContext } from "../listings/transforms";
import { fitDescription, fitTitle } from "../marketplaces/registry";
import { PROMPT_VERSION } from "./prompts";
import type { AiProvider, CopilotEvent, CopilotTool, CopilotTurn, IdentifyInput, IdentifyOutput, OfferAdviceInput, StudioQaInput, WriteListingInput, WriteListingOutput } from "./provider";
import { tierFromConfidence, type EvidencedField, type ItemProfile, type ListingCopy, type OfferAdvice, type SelfCheck, type StudioQa } from "./schemas";

/**
 * The Demo AI provider. Deterministic, realistic and honest about being a stand-in: it never calls a
 * model. Identification is driven by the demo catalogue (seller hints first, otherwise a hash of the
 * first photo's bytes), listing copy is composed from the verified profile and adapted per
 * marketplace, tone and length with real text transforms, and every artifact is tagged demo.
 */

export const DEMO_MODEL = "clover-demo-1";
export const DEMO_PROVIDER_TAG = "demo" as const;

export class DemoAiProvider implements AiProvider {
  readonly name = "demo" as const;

  async identify(input: IdentifyInput): Promise<IdentifyOutput> {
    if (input.images.length === 0) throw new Error("At least one photo is required to identify an item");
    const hints = input.userHints ?? {};
    const entry =
      matchCatalogByHints([hints.title, hints.brand, hints.category, hints.notes]) ??
      (input.candidates?.length ? matchCatalogByHints(input.candidates) : null) ??
      catalogByHash(imageHash(input.images[0]!.data));

    let profile = clampEvidence(structuredClone(entry.profile), input.images.length);
    if (input.escalate && entry.escalated) profile = normaliseTiers({ ...profile, ...structuredClone(entry.escalated) });

    const notes: string[] = profile.notes ? [profile.notes] : [];
    const hintBrand = hints.brand?.trim();
    const brand = profile.brand?.value;
    if (hintBrand && brand && !brand.toLowerCase().includes(hintBrand.toLowerCase()) && !hintBrand.toLowerCase().includes(brand.toLowerCase())) {
      notes.push(`Seller hint says the brand is "${hintBrand}"; the photos show ${brand}. Trusting the photos.`);
    }
    if (input.candidates?.length) notes.push(`Considered ${input.candidates.length} candidate${input.candidates.length === 1 ? "" : "s"} from external lookups.`);
    profile.notes = notes.length ? notes.join(" ") : null;

    return { profile, model: DEMO_MODEL, promptVersion: PROMPT_VERSION, usage: { inputTokens: 0, outputTokens: 0 } };
  }

  async writeListing(input: WriteListingInput): Promise<WriteListingOutput> {
    const entry = matchCatalogByProfile(input.profile);
    const sameIdentity = !!entry && entry.profile.itemName.value.toLowerCase() === input.profile.itemName.value.toLowerCase();
    const ctx: TransformContext = {
      itemName: input.profile.itemName.value,
      condition: input.profile.condition,
      verifiedAttributes: input.verifiedAttributes,
      compsVocabulary: input.compsVocabulary,
      limits: input.limits,
      alternates: sameIdentity && entry ? { seoTitle: entry.copy.seoTitle, persuasiveIntro: entry.copy.persuasiveIntro } : undefined,
    };
    const base = input.existing ?? (sameIdentity && entry ? copyFromEntry(entry, input) : copyFromFacts(input));
    let copy = applyLength(applyTone(base, input.tone, ctx), input.length, ctx);
    copy = fitToMarketplace(copy, input);

    const facts = factsFrom(input);
    let selfCheck = checkListingClaims(facts, copy);
    if (selfCheck.verdict !== "pass") {
      // Second pass, like the model loop: drop the claims the checker could not ground.
      copy = removeUnsupported(copy, selfCheck);
      selfCheck = checkListingClaims(facts, copy);
    }
    return { copy, selfCheck, model: DEMO_MODEL, promptVersion: PROMPT_VERSION };
  }

  async studioQa(input: StudioQaInput): Promise<StudioQa> {
    return {
      sameItem: true,
      defectsStillVisible: true,
      nothingAddedOrRemoved: true,
      verdict: "pass",
      reason: `Demo QA for ${input.mode}: no vision model compared the images. The local studio pipeline re-composites the original cut-out pixel-for-pixel, so the item cannot have changed; treat this as a pipeline guarantee, not a visual check.`,
    };
  }

  async offerAdvice(input: OfferAdviceInput): Promise<OfferAdvice> {
    return adviseOnOffer(input);
  }

  async *copilot(input: { system: string; history: CopilotTurn[]; tools: CopilotTool[] }): AsyncGenerator<CopilotEvent> {
    const last = [...input.history].reverse().find((t) => t.role === "user")?.content ?? "";
    const plan = routeCopilot(last, input.tools);
    const toolTrace: Array<{ name: string; input: Record<string, unknown>; summary: string }> = [];
    const results: Array<{ name: string; result: unknown; error: string | null }> = [];

    for (const step of plan.calls) {
      const tool = input.tools.find((t) => t.name === step.name);
      if (!tool) continue;
      yield { type: "tool_call", name: step.name, input: step.input };
      try {
        const out = await tool.run(step.input);
        const text = typeof out === "string" ? out : JSON.stringify(out);
        const summary = text.length > 140 ? `${text.slice(0, 137)}…` : text;
        toolTrace.push({ name: step.name, input: step.input, summary });
        results.push({ name: step.name, result: out, error: null });
        yield { type: "tool_result", name: step.name, summary };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toolTrace.push({ name: step.name, input: step.input, summary: `error: ${msg}` });
        results.push({ name: step.name, result: null, error: msg });
        yield { type: "tool_result", name: step.name, summary: `error: ${msg}` };
      }
    }

    const text = composeCopilotAnswer(plan, results, input.tools, last);
    for (const delta of chunkText(text)) yield { type: "text", delta };
    yield { type: "done", text, toolTrace };
  }
}

// ─────────────────────────── identification helpers ───────────────────────────

function clampField(f: EvidencedField | null, n: number): EvidencedField | null {
  if (!f) return f;
  return { ...f, evidenceImage: f.evidenceImage === null ? null : Math.min(Math.max(1, f.evidenceImage), n) };
}

/** Evidence indexes in the catalogue assume up to four photos; clamp them to what the seller sent. */
export function clampEvidence(p: ItemProfile, n: number): ItemProfile {
  return {
    ...p,
    itemName: clampField(p.itemName, n)!,
    brand: clampField(p.brand, n),
    model: clampField(p.model, n),
    modelNumber: clampField(p.modelNumber, n),
    color: clampField(p.color, n),
    material: clampField(p.material, n),
    size: clampField(p.size, n),
    dimensions: clampField(p.dimensions, n),
    approximateAge: clampField(p.approximateAge, n),
    attributes: p.attributes.map((a) => ({ ...a, field: clampField(a.field, n)! })),
    condition: { ...p.condition, defects: p.condition.defects.map((d) => ({ ...d, evidenceImage: d.evidenceImage === null ? null : Math.min(Math.max(1, d.evidenceImage), n) })) },
  };
}

function normaliseTiers(p: ItemProfile): ItemProfile {
  const fix = (f: EvidencedField | null) => (f ? { ...f, tier: tierFromConfidence(f.confidence) } : f);
  return {
    ...p,
    itemName: fix(p.itemName)!,
    brand: fix(p.brand),
    model: fix(p.model),
    modelNumber: fix(p.modelNumber),
    color: fix(p.color),
    material: fix(p.material),
    size: fix(p.size),
    dimensions: fix(p.dimensions),
    approximateAge: fix(p.approximateAge),
    attributes: p.attributes.map((a) => ({ ...a, field: fix(a.field)! })),
    condition: { ...p.condition, tier: tierFromConfidence(p.condition.confidence) },
    identityTier: tierFromConfidence(p.identityConfidence),
  };
}

// ─────────────────────────── listing composition ───────────────────────────

const SPECIFIC_NAMES: Record<string, string> = { "Model number": "Model Number", Age: "Era", Dimensions: "Dimensions" };

function specificsFromAttributes(attrs: Array<{ name: string; value: string }>): Array<{ name: string; value: string }> {
  const out: Array<{ name: string; value: string }> = [];
  for (const a of attrs) {
    if (a.name === "Item") continue;
    if (/unknown|not shown|cannot tell/i.test(a.value)) continue;
    const name = SPECIFIC_NAMES[a.name] ?? a.name;
    if (!out.some((s) => s.name === name)) out.push({ name, value: a.value });
  }
  return out.slice(0, 12);
}

function factsFrom(input: WriteListingInput): Facts {
  return {
    itemName: input.profile.itemName.value,
    verifiedAttributes: input.verifiedAttributes,
    condition: input.profile.condition,
    accessoriesIncluded: input.profile.accessoriesIncluded,
    possiblyMissing: input.profile.possiblyMissing,
    unknowns: input.unknowns,
    shipping: input.shipping,
    priceCents: input.priceCents ?? null,
  };
}

function baseModel(intro: string[], input: WriteListingInput): DescriptionModel {
  return {
    intro,
    sections: [
      { key: "condition", heading: "Condition", lines: conditionLines(input.profile.condition) },
      { key: "included", heading: "What's included", lines: includedLines(input.profile) },
      { key: "unknown", heading: "Not shown / unknown", lines: unknownLines(input.profile, input.unknowns) },
    ],
    footer: shippingLine(input.marketplace, input.shipping),
  };
}

function conditionText(condition: ItemProfile["condition"]): string {
  return conditionLines(condition)
    .map((l) => l.replace(/^- /, ""))
    .join("\n");
}

export function copyFromEntry(entry: DemoCatalogEntry, input: WriteListingInput): ListingCopy {
  const profileText = [input.profile.itemName.value, ...input.verifiedAttributes.map((a) => a.value)].join(" ").toLowerCase();
  const fromAttrs = specificsFromAttributes(input.verifiedAttributes);
  const extra = entry.copy.specifics.filter((s) => !fromAttrs.some((f) => f.name.toLowerCase() === s.name.toLowerCase()) && profileText.includes(s.value.toLowerCase().split(" ")[0] ?? ""));
  return {
    title: entry.copy.title,
    description: renderDescription(baseModel([...entry.copy.intro], input)),
    bullets: [...entry.copy.bullets],
    conditionText: conditionText(input.profile.condition),
    specifics: [...fromAttrs, ...extra],
    keywords: dedupe([...entry.copy.keywords, ...input.profile.searchKeywords]).slice(0, 12),
    suggestedCategoryPath: [...entry.copy.suggestedCategoryPath],
  };
}

/** Closed-world composition for a profile the catalogue does not know (e.g. after seller edits). */
export function copyFromFacts(input: WriteListingInput): ListingCopy {
  const p = input.profile;
  const brand = p.brand?.value ?? null;
  const model = p.model?.value ?? null;
  const name = p.itemName.value;
  const attrs = input.verifiedAttributes.filter((a) => !["Item", "Brand", "Model"].includes(a.name));
  const titleParts = [brand, model, stripWords(name, [brand, model])].filter((x): x is string => !!x && x.trim().length > 0);
  const title = dedupeWords(titleParts.join(" "));
  const attrSentence = attrs.length ? `${attrs.slice(0, 4).map((a) => `${a.name.toLowerCase()}: ${a.value}`).join("; ")}.` : "";
  const intro = [`${name}${brand && !name.toLowerCase().includes(brand.toLowerCase()) ? ` by ${brand}` : ""}. ${attrSentence}`.trim()];
  const rest = attrs.slice(4);
  if (rest.length) intro.push(`Also noted: ${rest.map((a) => `${a.name.toLowerCase()} ${a.value}`).join(", ")}.`);
  return {
    title,
    description: renderDescription(baseModel(intro, input)),
    bullets: [...attrs.slice(0, 5).map((a) => `${a.name}: ${a.value}`), ...p.accessoriesIncluded.map((a) => `Includes ${a}`)].slice(0, 7),
    conditionText: conditionText(p.condition),
    specifics: specificsFromAttributes(input.verifiedAttributes),
    keywords: dedupe([...p.searchKeywords, ...[brand, model].filter((x): x is string => !!x)]).slice(0, 12),
    suggestedCategoryPath: [...p.categoryPath],
  };
}

/** Marketplace fit: the marketplace's own pickup/shipping line, no other marketplace names, and the length limits. */
function fitToMarketplace(copy: ListingCopy, input: WriteListingInput): ListingCopy {
  const model = parseDescription(copy.description);
  if (model.sections.length > 0) model.footer = shippingLine(input.marketplace, input.shipping);
  const rendered = stripOtherMarketplaceNames(renderDescription(model, input.tone), input.marketplace);
  return {
    ...copy,
    title: fitTitle(stripOtherMarketplaceNames(copy.title, input.marketplace), input.limits.titleMax),
    description: fitDescription(rendered, input.limits.descriptionMax),
    bullets: copy.bullets.map((b) => stripOtherMarketplaceNames(b, input.marketplace)).filter(Boolean),
  };
}

function removeUnsupported(copy: ListingCopy, check: SelfCheck): ListingCopy {
  const bad = new Set(check.claims.filter((c) => !c.supported).map((c) => c.claim.toLowerCase()));
  return {
    ...copy,
    bullets: copy.bullets.filter((b) => !bad.has(b.replace(/^[-•]\s*/, "").trim().toLowerCase())),
    specifics: copy.specifics.filter((s) => !bad.has(`${s.name}: ${s.value}`.toLowerCase())),
  };
}

function stripWords(text: string, words: Array<string | null>): string {
  let out = text;
  for (const w of words) if (w) out = out.replace(new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), "");
  return out.replace(/\s{2,}/g, " ").replace(/^[\s,–-]+|[\s,–-]+$/g, "");
}

function dedupeWords(s: string): string {
  const seen = new Set<string>();
  return s
    .split(/\s+/)
    .filter((w) => {
      const k = w.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .join(" ");
}

// ─────────────────────────── offer advice ───────────────────────────

/** Applies OFFER_ADVICE_SYSTEM's rules arithmetically. Counter amounts are whole dollars. */
export function adviseOnOffer(input: OfferAdviceInput): OfferAdvice {
  const { listPriceCents: list, offerCents: offer } = input;
  const floor = input.floorPriceCents ?? input.estimate?.quickSale ?? Math.round(list * 0.8);
  const bandLow = input.estimate?.quickSale ?? floor;
  const dollars = (c: number) => `$${Math.round(c / 100)}`;
  const net = Math.round(offer * (1 - input.feeRate));
  const patient = input.daysListed >= 30;

  if (offer >= list) {
    return { recommendation: "accept", counterAmountCents: null, reasoning: `The offer of ${dollars(offer)} meets your asking price of ${dollars(list)}.`, suggestedMessage: `Thanks for the offer on the ${input.itemTitle} — happy to accept. I'll get it ready as soon as the order goes through.` };
  }
  if (offer >= floor && offer >= bandLow) {
    return {
      recommendation: "accept",
      counterAmountCents: null,
      reasoning: `${dollars(offer)} clears your floor of ${dollars(floor)} and sits inside the estimate band (quick sale ${dollars(bandLow)}). After ${Math.round(input.feeRate * 100)}% fees you take home about ${dollars(net)}${patient ? `, and the listing has been up ${input.daysListed} days` : ""}.`,
      suggestedMessage: `Thanks for the offer on the ${input.itemTitle} — that works for me, so I've accepted it. Let me know if you have any questions before it ships.`,
    };
  }
  // A realistic middle: split the gap, leaning toward the buyer when the listing is stale.
  const split = patient ? 0.35 : 0.5;
  const middle = Math.round((offer + (list - offer) * split) / 100) * 100;
  if (middle > floor && middle > offer) {
    return {
      recommendation: "counter",
      counterAmountCents: middle,
      reasoning: `${dollars(offer)} is below your floor of ${dollars(floor)}, but there is room between the offer and your ${dollars(list)} asking price. Countering at ${dollars(middle)} stays above the floor${patient ? ` and leans toward the buyer since the listing is ${input.daysListed} days old` : ""}.`,
      suggestedMessage: `Thanks for your interest in the ${input.itemTitle}. I can't go quite that low, but I'd be glad to do ${dollars(middle)} if that works for you.`,
    };
  }
  return {
    recommendation: "decline",
    counterAmountCents: null,
    reasoning: `${dollars(offer)} is below your floor of ${dollars(floor)} and a counter above the floor would not be a meaningful move from the offer.`,
    suggestedMessage: `Thanks for the offer on the ${input.itemTitle}. I'm not able to go that low right now, but I appreciate you reaching out.`,
  };
}

// ─────────────────────────── copilot ───────────────────────────

type CopilotPlan = { intent: string; calls: Array<{ name: string; input: Record<string, unknown> }>; note: string | null };

const INTENTS: Array<{ intent: string; test: RegExp; tools: string[] }> = [
  { intent: "prioritise", test: /sell first|prioriti|start with|which (one|item) first/i, tools: ["list_items", "get_inventory_summary"] },
  { intent: "overpriced", test: /over-?priced|too (high|expensive)|priced too/i, tools: ["list_items", "get_inventory_summary"] },
  { intent: "projection", test: /how much (could|can|would) i make|if everything sells|worth in total|everything sold/i, tools: ["list_items", "get_inventory_summary"] },
  { intent: "stale", test: /\b(stale|not selling|hasn'?t sold|sitting|old listings?|no (offers|views)|reprice|price drop|lower the price)\b/i, tools: ["get_stale_listings", "get_inventory_summary"] },
  { intent: "offers", test: /\b(offers?|counter|buyer|negotiat)/i, tools: ["get_offers"] },
  { intent: "performance", test: /\b(marketplace|ebay|facebook|offerup|nextdoor|where (should|do)|performing|performance|sells? best|best channel)\b/i, tools: ["get_marketplace_performance", "get_inventory_summary"] },
  { intent: "price", test: /\b(worth|price|estimate|value|how much)\b/i, tools: ["get_inventory_summary", "list_items"] },
  { intent: "listing", test: /\b(rewrite|title|description|listing copy|wording)\b/i, tools: ["list_items"] },
  { intent: "inventory", test: /\b(inventory|items?|what do i have|how many|listed|sold|summary|overview)\b/i, tools: ["get_inventory_summary", "list_items"] },
];

export function routeCopilot(message: string, tools: CopilotTool[]): CopilotPlan {
  const available = new Set(tools.map((t) => t.name));
  const match = INTENTS.find((i) => i.test.test(message)) ?? { intent: "inventory", tools: ["get_inventory_summary"] };
  const calls = match.tools.filter((t) => available.has(t)).map((name) => ({ name, input: {} as Record<string, unknown> }));
  let note: string | null = null;
  if (calls.length === 0) note = available.size === 0 ? "No tools were provided, so this answer contains no data from your inventory." : `None of the tools I would use for that (${match.tools.join(", ")}) are available right now.`;
  if (match.intent === "listing") note = "The demo copilot can read your inventory but cannot rewrite listings from chat — open the item and use the listing tools (shorter, persuasive, casual, professional, search, condition).";
  if (match.intent === "stale" && /\b(reprice|price drop|lower)\b/i.test(message)) note = "I can show what is stale, but repricing is a proposal you confirm on the item page; the demo copilot does not change prices from chat.";
  return { intent: match.intent, calls, note };
}

const ESTIMATE_KEY = /estimat|projected|expected|recommend|likely|forecast|suggest/i;
const MONEY_KEY = /cents$|price|amount|value|net|fee|revenue|proceeds|total$|cost/i;

function labelOf(key: string): string {
  const spaced = key.replace(/Cents$/, "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatValue(key: string, v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") {
    if (MONEY_KEY.test(key) && Number.isInteger(v) && Math.abs(v) >= 100) return `$${(v / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
    return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  if (typeof v === "string") return /^\d{4}-\d{2}-\d{2}T/.test(v) ? new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : v;
  if (typeof v === "boolean") return v ? "yes" : "no";
  return null;
}

function describeRecord(rec: Record<string, unknown>, depth = 0): string[] {
  const lines: string[] = [];
  for (const [key, v] of Object.entries(rec)) {
    if (/^(id|.*Id|userId|createdAt|updatedAt)$/.test(key)) continue;
    const scalar = formatValue(key, v);
    if (scalar !== null) {
      lines.push(`${labelOf(key)}: ${scalar}${ESTIMATE_KEY.test(key) ? " (estimate)" : ""}`);
    } else if (Array.isArray(v)) {
      const names = v.slice(0, 5).map((x) => (x && typeof x === "object" ? recordName(x as Record<string, unknown>) : String(x))).filter(Boolean);
      lines.push(`${labelOf(key)}: ${v.length}${names.length ? ` — ${names.join("; ")}` : ""}`);
    } else if (v && typeof v === "object" && depth < 1) {
      const inner = describeRecord(v as Record<string, unknown>, depth + 1);
      if (inner.length) lines.push(`${labelOf(key)} — ${inner.join(", ")}`);
    }
    if (lines.length >= 12) break;
  }
  return lines;
}

function recordName(rec: Record<string, unknown>): string {
  const name = (rec.title ?? rec.name ?? rec.itemName ?? rec.buyerName ?? rec.marketplace ?? rec.sku) as string | undefined;
  const money = Object.entries(rec).find(([k, v]) => MONEY_KEY.test(k) && typeof v === "number");
  const status = typeof rec.status === "string" ? ` (${rec.status.toLowerCase().replace(/_/g, " ")})` : "";
  return `${name ?? "item"}${money ? ` ${formatValue(money[0], money[1]) ?? ""}` : ""}${status}`;
}

type ToolResult = { name: string; result: unknown; error: string | null };
type Rec = Record<string, unknown>;
const money = (cents: unknown) => (typeof cents === "number" ? `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}` : "—");
const asRecs = (v: unknown): Rec[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Rec[]) : []);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const resultOf = (results: ToolResult[], name: string): Rec | null => {
  const r = results.find((x) => x.name === name && !x.error);
  return r && r.result && typeof r.result === "object" && !Array.isArray(r.result) ? (r.result as Rec) : null;
};
const daysSince = (iso: unknown): number | null => (typeof iso === "string" && !Number.isNaN(Date.parse(iso)) ? Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 86_400_000)) : null);

/**
 * Direct answers for the questions the product promises to handle. Each one reads the tool
 * results it needs and states facts vs estimates explicitly. Returns null when the question does
 * not fit, so the generic summariser below takes over.
 */
function directAnswer(message: string, results: ToolResult[]): string | null {
  const listed = asRecs(resultOf(results, "list_items")?.items);
  const summary = resultOf(results, "get_inventory_summary");
  const unsold = listed.filter((i) => !["SOLD", "SHIPPED", "COMPLETED", "ARCHIVED"].includes(String(i.status)));

  if (/\bover-?priced\b|too (high|expensive)|priced too/i.test(message)) {
    const rows = unsold
      .map((i) => ({ i, price: num(i.listPriceCents) ?? num(i.listPrice), est: num((i.estimate as Rec | null)?.recommendedCents) ?? num(i.estimatedValue) }))
      .filter((r): r is { i: Rec; price: number; est: number } => r.price !== null && r.est !== null && r.est > 0)
      .map((r) => ({ ...r, ratio: r.price / r.est }))
      .filter((r) => r.ratio > 1.08)
      .sort((a, b) => b.ratio - a.ratio);
    if (listed.length === 0) return null;
    if (rows.length === 0) return `None of your ${unsold.length} unsold items are priced more than 8% above Clover's recommended price (estimate). If something isn't moving, the cause is more likely photos or the listing than the price.`;
    const lines = rows.slice(0, 6).map((r) => `- ${r.i.title}: listed at ${money(r.price)} vs a recommended ${money(r.est)} (estimate) — ${Math.round((r.ratio - 1) * 100)}% above`);
    return `${rows.length} item${rows.length === 1 ? " is" : "s are"} priced above Clover's recommendation:\n${lines.join("\n")}\n\nRecommended prices are estimates from comparable listings. A quick way to test the market: drop to the recommended price for two weeks before going lower.`;
  }

  if (/sell first|prioriti|start with|which (one|item) first/i.test(message)) {
    const ranked = unsold
      .map((i) => ({ i, value: num((i.estimate as Rec | null)?.recommendedCents) ?? num(i.listPriceCents) ?? num(i.estimatedValue) ?? 0, days: num(i.daysOnMarket) ?? daysSince(i.listedAt) }))
      .sort((a, b) => b.value - a.value);
    if (ranked.length === 0) return null;
    const ready = ranked.filter((r) => r.i.status === "READY" || r.i.status === "DRAFT");
    const top = (ready.length ? ready : ranked).slice(0, 5);
    const lines = top.map((r, n) => `${n + 1}. ${r.i.title} — ${money(r.value)} (estimate)${r.i.status === "READY" ? ", ready to publish" : r.i.status === "DRAFT" ? ", still a draft" : r.days !== null ? `, listed ${r.days} days` : ""}`);
    return `${ready.length ? "Start with what's worth the most and isn't live yet:" : "Everything is already listed; these carry the most value:"}\n${lines.join("\n")}\n\nValues are Clover's estimates, not sales. Publishing the top ${Math.min(3, top.length)} first puts the most money in play with the least effort.`;
  }

  if (/how much (could|can|would) i make|if everything sells|total (value|worth)|worth in total|everything sold/i.test(message)) {
    const withValue = unsold.map((i) => num(i.listPriceCents) ?? num((i.estimate as Rec | null)?.recommendedCents) ?? 0);
    const gross = withValue.reduce((a, b) => a + b, 0);
    const estOnly = unsold.map((i) => num((i.estimate as Rec | null)?.recommendedCents) ?? num(i.listPriceCents) ?? 0).reduce((a, b) => a + b, 0);
    if (unsold.length === 0) return null;
    const cost = unsold.map((i) => num(i.acquisitionCostCents) ?? num(i.acquisitionCost) ?? 0).reduce((a, b) => a + b, 0);
    const feeGuess = Math.round(gross * 0.11);
    return `If all ${unsold.length} unsold items sold at their list prices you'd gross ${money(gross)} (estimate); at Clover's recommended prices, ${money(estOnly)} (estimate). After roughly 11% in marketplace fees that's about ${money(gross - feeGuess)}${cost ? `, or ${money(gross - feeGuess - cost)} profit after the ${money(cost)} you paid for them` : ""}.\n\nThese are projections. Realised revenue so far: ${summary ? money(num(summary.revenueAllCents) ?? num(summary.revenueAll)) : "see Insights"}.`;
  }

  if (/hasn'?t sold|not (selling|sold)|stale|sitting/i.test(message)) {
    const stale = resultOf(results, "get_stale_listings");
    const items = asRecs(stale?.items);
    if (!stale) return null;
    if (items.length === 0) return `Nothing has gone stale: every live listing is under ${num(stale.days) ?? 14} days old or has had an offer.`;
    const lines = items.slice(0, 6).map((i) => `- ${i.title} — listed ${num(i.daysListed) ?? daysSince(i.listedAt) ?? "?"} days at ${money(i.listPriceCents ?? i.listPrice)}${(i.estimate as Rec | null)?.quickSaleCents !== undefined ? `, quick-sale estimate ${money((i.estimate as Rec).quickSaleCents)}` : ""}${i.suggestedPriceCents ? `, suggested ${money(i.suggestedPriceCents)}` : ""}`);
    return `${items.length} listing${items.length === 1 ? " has" : "s have"} been live ${num(stale.days) ?? 14}+ days with no offers:\n${lines.join("\n")}\n\nFor each, either refresh the photos and title or move toward the quick-sale estimate. Repricing is a proposal you confirm on the item page.`;
  }

  if (/marketplace|where (should|do)|best (channel|place)|perform/i.test(message)) {
    const perf = resultOf(results, "get_marketplace_performance");
    const rows = asRecs(perf?.marketplaces).filter((m) => (num(m.sold) ?? 0) > 0 || (num(m.active) ?? 0) > 0);
    if (!perf) return null;
    if (rows.length === 0) return "There are no sales or live listings to compare marketplaces yet. Once a few items sell, this will rank them by revenue and sell-through.";
    const byRev = [...rows].sort((a, b) => (num(b.revenueCents) ?? 0) - (num(a.revenueCents) ?? 0));
    const lines = byRev.map((m) => `- ${m.name}: ${money(m.revenueCents)} from ${num(m.sold) ?? 0} sold, ${num(m.active) ?? 0} live, sell-through ${Math.round((num(m.sellThrough) ?? 0) * 100)}%, fees ${Math.round((num(m.feeRate) ?? 0) * 100)}%`);
    const best = byRev[0]!;
    const category = /electronics|camera|keyboard|console|phone/i.test(message) ? " for that category" : "";
    return `${best.name} has produced the most revenue${category}: ${money(best.revenueCents)} from ${num(best.sold) ?? 0} sale${num(best.sold) === 1 ? "" : "s"}.\n${lines.join("\n")}\n\nThese are your recorded sales (facts). Sell-through on small samples is noisy; fees are the marketplaces' published rates.`;
  }

  if (/accept|counter|offer/i.test(message)) {
    const offers = asRecs(resultOf(results, "get_offers")?.offers).filter((o) => o.status === "PENDING" || o.status === undefined);
    if (!resultOf(results, "get_offers")) return null;
    if (offers.length === 0) return "You have no pending offers right now. When one arrives it shows up on the Offers page with a suggestion (accept, counter or decline) and the estimated profit after fees.";
    const lines = offers.slice(0, 5).map((o) => {
      const amt = num(o.amountCents) ?? num(o.amount);
      const ask = num(o.askingCents) ?? num(o.originalPriceCents) ?? num(o.originalPrice);
      const floor = num(o.floorPriceCents) ?? num(o.floorPrice);
      const pct = num(o.percentBelowAsking) ?? (amt !== null && ask ? Math.round((1 - amt / ask) * 100) : null);
      const verdict = amt !== null && floor !== null ? (amt >= floor ? "above your floor — accepting is reasonable" : "below your floor — counter or decline") : pct !== null && pct <= 12 ? "within 12% of asking — worth accepting" : "well under asking — counter";
      return `- ${o.itemTitle ?? o.title ?? "Item"}: ${money(amt)} offered vs ${money(ask)} asking${pct !== null ? ` (${pct}% below)` : ""} on ${o.marketplace ?? "?"} — ${verdict}`;
    });
    return `${offers.length} pending offer${offers.length === 1 ? "" : "s"}:\n${lines.join("\n")}\n\nFloors and asking prices are your own numbers; Clover's suggested counter on each offer is an estimate. Accepting ends the item's other listings so it can't sell twice.`;
  }
  return null;
}

export function composeCopilotAnswer(plan: CopilotPlan, results: Array<{ name: string; result: unknown; error: string | null }>, tools: CopilotTool[], message = ""): string {
  const paras: string[] = [];
  const ok = results.filter((r) => !r.error);
  const direct = ok.length ? directAnswer(message, results) : null;
  if (direct) {
    paras.push(direct);
    if (plan.note) paras.push(plan.note);
    paras.push("Demo copilot — answers are computed from your inventory; no language model was used.");
    return paras.join("\n\n");
  }
  if (ok.length === 0) {
    paras.push(plan.note ?? "I could not read your data for that question.");
    for (const r of results.filter((r) => r.error)) paras.push(`${labelOf(r.name)} failed: ${r.error}`);
    if (tools.length) paras.push(`Ask about stale listings, pending offers, marketplace performance, or what your inventory is worth and I'll pull the numbers.`);
    return paras.join("\n\n");
  }
  for (const r of ok) {
    const heading = labelOf(r.name).replace(/^Get /, "");
    if (Array.isArray(r.result)) {
      const items = r.result as unknown[];
      if (items.length === 0) {
        paras.push(`${heading}: nothing to report right now.`);
        continue;
      }
      const lines = items.slice(0, 6).map((x) => `- ${x && typeof x === "object" ? recordName(x as Record<string, unknown>) : String(x)}`);
      paras.push(`${heading} (${items.length}):\n${lines.join("\n")}${items.length > 6 ? `\n…and ${items.length - 6} more.` : ""}`);
    } else if (r.result && typeof r.result === "object") {
      const lines = describeRecord(r.result as Record<string, unknown>);
      paras.push(lines.length ? `${heading}:\n${lines.map((l) => `- ${l}`).join("\n")}` : `${heading}: no details returned.`);
    } else {
      paras.push(`${heading}: ${String(r.result)}`);
    }
  }
  for (const r of results.filter((r) => r.error)) paras.push(`${labelOf(r.name)} could not be read: ${r.error}.`);
  if (plan.note) paras.push(plan.note);
  paras.push("Figures above come from your inventory as facts; anything marked (estimate) is Clover's estimate, not a sale. Demo copilot — no language model was used.");
  return paras.join("\n\n");
}

function chunkText(text: string): string[] {
  const out: string[] = [];
  const words = text.split(/(\s+)/);
  let buf = "";
  for (const w of words) {
    buf += w;
    if (buf.length >= 12) {
      out.push(buf);
      buf = "";
    }
  }
  if (buf) out.push(buf);
  return out;
}
