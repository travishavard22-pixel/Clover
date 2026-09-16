import type { ItemProfile, ListingTone } from "../ai/schemas";
import type { WriteListingInput } from "../ai/provider";
import { gradeLabel } from "../pricing/condition";

/**
 * Pure text model for listing descriptions. Descriptions are plain text with short paragraphs and
 * three well-known sections (Condition, What's included, Not shown / unknown) followed by a
 * pickup/shipping line. Both the demo writer and the deterministic marketplace derivation work on
 * this model so headings, ordering and the mandatory disclosure blocks stay consistent.
 */

export type SectionKey = "condition" | "included" | "unknown" | "other";
export type Section = { key: SectionKey; heading: string; lines: string[] };
export type DescriptionModel = { intro: string[]; sections: Section[]; footer: string | null };

export const HEADINGS: Record<Exclude<SectionKey, "other">, Record<"neutral" | "casual" | "professional", string>> = {
  condition: { neutral: "Condition", casual: "Condition", professional: "Condition report" },
  included: { neutral: "What's included", casual: "What you get", professional: "Included" },
  unknown: { neutral: "Not shown / unknown", casual: "Heads up", professional: "Not shown or unverified" },
};

const HEADING_LOOKUP: Array<[RegExp, Exclude<SectionKey, "other">]> = [
  [/^condition( report)?:?$/i, "condition"],
  [/^(what'?s included|what you get|included|includes):?$/i, "included"],
  [/^(not shown \/ unknown|not shown or unverified|heads up|unknowns?|not shown):?$/i, "unknown"],
];

export function headingStyle(tone: ListingTone | undefined): "neutral" | "casual" | "professional" {
  if (tone === "casual") return "casual";
  if (tone === "professional") return "professional";
  return "neutral";
}

/** Splits a description into intro paragraphs, headed sections and the trailing shipping line. */
export function parseDescription(text: string): DescriptionModel {
  const paragraphs = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const model: DescriptionModel = { intro: [], sections: [], footer: null };
  let current: Section | null = null;
  for (const p of paragraphs) {
    const lines = p.split("\n").map((l) => l.trim()).filter(Boolean);
    const first = lines[0] ?? "";
    const heading = HEADING_LOOKUP.find(([re]) => re.test(first));
    if (heading) {
      current = { key: heading[1], heading: first.replace(/:$/, ""), lines: lines.slice(1) };
      model.sections.push(current);
      continue;
    }
    if (current && lines.every((l) => /^[-•]/.test(l))) {
      current.lines.push(...lines);
      continue;
    }
    if (current) current = null;
    model.intro.push(lines.join("\n"));
  }
  // The pickup/shipping line is the last intro paragraph after the sections, when one exists.
  if (model.sections.length && model.intro.length > 1 && isShippingLine(model.intro[model.intro.length - 1]!)) model.footer = model.intro.pop()!;
  return model;
}

export function isShippingLine(p: string): boolean {
  return /\b(pickup|ships?|shipping|hand-?off|meet|deliver)/i.test(p) && p.split("\n").length === 1;
}

export function renderDescription(model: DescriptionModel, tone?: ListingTone): string {
  const style = headingStyle(tone);
  const parts: string[] = [...model.intro];
  for (const s of model.sections) {
    if (s.lines.length === 0) continue;
    const heading = s.key === "other" ? s.heading : HEADINGS[s.key][style];
    parts.push(`${heading}\n${s.lines.join("\n")}`);
  }
  if (model.footer) parts.push(model.footer);
  return parts.join("\n\n").trim();
}

// ─────────────────────────── section builders ───────────────────────────

export function conditionLines(condition: ItemProfile["condition"]): string[] {
  const lines = [`${gradeLabel(condition.grade)}. ${condition.summary.trim()}`];
  for (const d of condition.defects) {
    const photo = d.evidenceImage ? ` (see photo ${d.evidenceImage})` : "";
    lines.push(`- ${capitalize(d.severity)} ${d.type.replace("_", " ")} on the ${lowerFirst(d.location)}: ${lowerFirst(d.description)}${photo}`);
  }
  const fn = functionalLine(condition.functionalStatus);
  if (fn) lines.push(fn);
  return lines;
}

export function functionalLine(status: ItemProfile["condition"]["functionalStatus"]): string | null {
  switch (status) {
    case "tested_working":
      return "Tested and working.";
    case "powers_on":
      return "Powers on; not every function has been tested.";
    case "untested":
      return "Untested — sold as pictured.";
    case "not_working":
      return "Not working — sold for parts or repair.";
    default:
      return null;
  }
}

export function includedLines(profile: Pick<ItemProfile, "accessoriesIncluded" | "itemName">): string[] {
  const items = [profile.itemName.value, ...profile.accessoriesIncluded];
  return items.map((a) => `- ${a}`);
}

export function unknownLines(profile: Pick<ItemProfile, "possiblyMissing" | "unknowns">, extraUnknowns: string[] = []): string[] {
  const all = [...profile.possiblyMissing, ...profile.unknowns, ...extraUnknowns];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of all) {
    const k = u.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(`- ${ensurePeriod(u.trim())}`);
  }
  return out;
}

export type ShippingContext = WriteListingInput["shipping"];
export type MarketplaceKey = WriteListingInput["marketplace"];

/** The pickup/shipping line each marketplace expects. Never names another marketplace. */
export function shippingLine(marketplace: MarketplaceKey, shipping: ShippingContext): string {
  const city = shipping.city?.trim();
  const inCity = city ? ` in ${city}` : "";
  const note = shipping.note?.trim() ? ` ${ensurePeriod(shipping.note.trim())}` : "";
  const localOnly = marketplace === "NEXTDOOR" || marketplace === "CRAIGSLIST";
  if (localOnly) {
    return `Local pickup${inCity}. Cash or a payment app at handoff; no shipping.${note}`;
  }
  if (marketplace === "POSHMARK") return `Ships with the prepaid label provided at checkout.${note}`;
  const ship = shipping.offersShipping;
  const local = shipping.offersLocalPickup;
  if (ship && local) {
    if (marketplace === "EBAY") return `Ships within two business days; local pickup${inCity} available on request.${note}`;
    if (marketplace === "FACEBOOK" || marketplace === "OFFERUP" || marketplace === "MERCARI") return `Local pickup${inCity} or shipping through checkout.${note}`;
    return `Shipping and local pickup${inCity} both available.${note}`;
  }
  if (ship) return `Ships within two business days.${note}`;
  if (local) return `Local pickup only${inCity}.${note}`;
  return `Contact me to arrange handoff.${note}`;
}

// ─────────────────────────── marketplace names ───────────────────────────

const MARKETPLACE_NAME_PATTERNS: Array<[MarketplaceKey, RegExp]> = [
  ["EBAY", /\be-?bay\b/gi],
  ["FACEBOOK", /\bfacebook( marketplace)?\b/gi],
  ["OFFERUP", /\boffer ?up\b/gi],
  ["NEXTDOOR", /\bnextdoor\b/gi],
  ["CRAIGSLIST", /\bcraigslist\b/gi],
  ["MERCARI", /\bmercari\b/gi],
  ["POSHMARK", /\bposhmark\b/gi],
];

/** Removes references to marketplaces other than `keep` (marketplaces reject cross-promotion). */
export function stripOtherMarketplaceNames(text: string, keep: MarketplaceKey): string {
  let out = text;
  for (const [m, re] of MARKETPLACE_NAME_PATTERNS) {
    if (m === keep) continue;
    out = out.replace(re, "");
  }
  return out
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\bon\s*\./g, ".")
    .trim();
}

// ─────────────────────────── small helpers ───────────────────────────

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
export function lowerFirst(s: string): string {
  // Keep acronyms / model codes (e.g. "USB-C port") intact.
  if (/^[A-Z]{2,}/.test(s) || /^[A-Z][a-z]*\d/.test(s)) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}
export function ensurePeriod(s: string): string {
  return /[.!?…]$/.test(s) ? s : `${s}.`;
}

export function sentences(p: string): string[] {
  return p.split(/(?<=[.!?…])\s+(?=[A-Z0-9"'(])/).filter(Boolean);
}
