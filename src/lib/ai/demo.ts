import { imageHash } from "../images";
import { catalogByHash, matchCatalogByHints, matchCatalogByProfile, type DemoCatalogEntry } from "../demo/catalog";
import { conditionLines, includedLines, parseDescription, renderDescription, shippingLine, stripOtherMarketplaceNames, unknownLines, type DescriptionModel } from "../listings/compose";
import { checkListingClaims, type Facts } from "../listings/self-check";
import { applyLength, applyTone, dedupe, type TransformContext } from "../listings/transforms";
import { fitDescription, fitTitle } from "../marketplaces/registry";
import { gradeLabel } from "../pricing/condition";
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

    const text = composeCopilotAnswer(plan, results, input.tools);
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

export function composeCopilotAnswer(plan: CopilotPlan, results: Array<{ name: string; result: unknown; error: string | null }>, tools: CopilotTool[]): string {
  const paras: string[] = [];
  const ok = results.filter((r) => !r.error);
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
