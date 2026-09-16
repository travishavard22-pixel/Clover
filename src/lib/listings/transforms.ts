import type { ItemProfile, ListingCopy, ListingLength, ListingTone } from "../ai/schemas";
import { fitTitle } from "../marketplaces/registry";
import { gradeLabel } from "../pricing/condition";
import { capitalize, ensurePeriod, parseDescription, renderDescription, sentences, type DescriptionModel } from "./compose";

/**
 * Deterministic tone and length transforms over a `ListingCopy`. They rewrite phrasing, ordering and
 * emphasis but never introduce facts: every sentence they add is built from the copy itself, the
 * verified specifics or the condition report passed in `ctx`.
 */

export type TransformContext = {
  itemName: string;
  condition: ItemProfile["condition"];
  verifiedAttributes: Array<{ name: string; value: string }>;
  compsVocabulary?: string[];
  limits: { titleMax: number; descriptionMax: number };
  /** Catalogue-authored alternates when available (demo). */
  alternates?: { seoTitle?: string; persuasiveIntro?: string };
};

const CONTRACTIONS: Array<[RegExp, string]> = [
  [/\bI have not\b/g, "I haven't"],
  [/\bI have\b/g, "I've"],
  [/\bI am\b/g, "I'm"],
  [/\bit is\b/g, "it's"],
  [/\bIt is\b/g, "It's"],
  [/\bthat is\b/g, "that's"],
  [/\bdo not\b/g, "don't"],
  [/\bdoes not\b/g, "doesn't"],
  [/\bhas not\b/g, "hasn't"],
  [/\bhave not\b/g, "haven't"],
  [/\bcannot\b/g, "can't"],
  [/\bis not\b/g, "isn't"],
  [/\bare not\b/g, "aren't"],
  [/\bwill not\b/g, "won't"],
  [/\bthere is\b/g, "there's"],
];

const EXPANSIONS: Array<[RegExp, string]> = [
  [/\bI haven't\b/g, "The seller has not"],
  [/\bI've\b/g, "The seller has"],
  [/\bI'm\b/g, "The seller is"],
  [/\bI have not\b/g, "The seller has not"],
  [/\bI have\b/g, "The seller has"],
  [/\bI am\b/g, "The seller is"],
  [/\bit's\b/g, "it is"],
  [/\bIt's\b/g, "It is"],
  [/\bthat's\b/g, "that is"],
  [/\bdon't\b/g, "do not"],
  [/\bdoesn't\b/g, "does not"],
  [/\bhasn't\b/g, "has not"],
  [/\bhaven't\b/g, "have not"],
  [/\bcan't\b/g, "cannot"],
  [/\bisn't\b/g, "is not"],
  [/\baren't\b/g, "are not"],
  [/\bwon't\b/g, "will not"],
  [/\bthere's\b/g, "there is"],
  [/\bSelling my\b/g, "This listing is for a"],
  [/\bmy\b/g, "the"],
  [/\bI\b/g, "the seller"],
  [/\bme\b/g, "the seller"],
];

/** Capitalises the first letter of each sentence (after expansions lower-cased a pronoun). */
function capitalizeSentences(text: string): string {
  return capitalize(text).replace(/([.!?…]\s+)([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** Replaces a generic lead-in ("A …", "This listing is for a …", "Selling my …") with the requested one, or prepends it. */
function swapLead(first: string, lead: string, itemName: string): string {
  const generic = /^(a |an |this listing is for an? |selling my |for sale: )/i;
  if (new RegExp(`^${lead.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(first)) return first;
  if (generic.test(first)) return `${lead} ${first.replace(generic, "")}`;
  return `${lead} ${lowerLead(itemName)}.${first ? ` ${first}` : ""}`;
}

function apply(text: string, rules: Array<[RegExp, string]>): string {
  return rules.reduce((acc, [re, to]) => acc.replace(re, to), text);
}

function mapModel(copy: ListingCopy, fn: (m: DescriptionModel) => DescriptionModel, tone?: ListingTone): ListingCopy {
  return { ...copy, description: renderDescription(fn(parseDescription(copy.description)), tone) };
}

function mapText(model: DescriptionModel, fn: (s: string) => string): DescriptionModel {
  return {
    intro: model.intro.map(fn),
    sections: model.sections.map((s) => ({ ...s, lines: s.lines.map(fn) })),
    footer: model.footer ? fn(model.footer) : null,
  };
}

// ─────────────────────────── length ───────────────────────────

export function shorten(copy: ListingCopy, ctx: TransformContext): ListingCopy {
  const out = mapModel(copy, (m) => ({
    intro: m.intro.length ? [sentences(m.intro[0]!).slice(0, 2).join(" ")] : [],
    sections: m.sections.map((s) => (s.key === "condition" ? { ...s, lines: s.lines.map((l, i) => (i === 0 ? sentences(l).slice(0, 2).join(" ") : l)) } : s)),
    footer: m.footer,
  }));
  return {
    ...out,
    bullets: copy.bullets.slice(0, 4),
    conditionText: sentences(copy.conditionText).slice(0, 2).join(" "),
    keywords: copy.keywords.slice(0, 8),
    title: fitTitle(copy.title, Math.min(ctx.limits.titleMax, 70)),
  };
}

export function lengthen(copy: ListingCopy, ctx: TransformContext): ListingCopy {
  const specifics = copy.specifics.length ? copy.specifics : ctx.verifiedAttributes.slice(0, 6).map((a) => ({ name: a.name, value: a.value }));
  const detail = specifics.length ? `At a glance: ${specifics.map((s) => `${s.name.toLowerCase()} ${s.value}`).join(", ")}.` : null;
  const out = mapModel(copy, (m) => ({
    ...m,
    intro: detail && !m.intro.some((p) => p.startsWith("At a glance")) ? [...m.intro, detail] : m.intro,
  }));
  const extraBullets = ctx.verifiedAttributes.filter((a) => !copy.bullets.some((b) => b.toLowerCase().includes(a.value.toLowerCase()))).slice(0, 3).map((a) => `${a.name}: ${a.value}`);
  return { ...out, bullets: [...copy.bullets, ...extraBullets].slice(0, 8) };
}

// ─────────────────────────── tones ───────────────────────────

export function persuasive(copy: ListingCopy, ctx: TransformContext): ListingCopy {
  const opener = ctx.alternates?.persuasiveIntro ?? `${ctx.itemName} in ${gradeLabel(ctx.condition.grade, { lower: true })} condition${copy.bullets[0] ? ` — ${lowerLead(copy.bullets[0])}` : ""}.`;
  const out = mapModel(copy, (m) => {
    const intro = m.intro.filter((p) => p !== opener);
    return { ...m, intro: [opener, ...intro.filter((p) => !ctx.alternates?.persuasiveIntro || !p.startsWith(ctx.itemName)), "Questions are welcome — ask before you buy and I'll check the photos or the item for you."] };
  });
  // Lead with the most specific bullets (longer ones carry more detail), keep disclosures last.
  const disclosures = copy.bullets.filter((b) => /disclos|untested|as-is|not tested|defect|wear|rust|scratch/i.test(b));
  const rest = copy.bullets.filter((b) => !disclosures.includes(b)).sort((a, b) => b.length - a.length);
  return { ...out, bullets: [...rest, ...disclosures] };
}

export function casual(copy: ListingCopy, ctx: TransformContext): ListingCopy {
  const out = mapModel(
    copy,
    (m) => {
      const mapped = mapText(m, (s) => apply(s, CONTRACTIONS));
      const first = mapped.intro[0] ?? "";
      return { ...mapped, intro: [swapLead(first, "Selling my", ctx.itemName), ...mapped.intro.slice(1)] };
    },
    "casual",
  );
  return { ...out, conditionText: apply(copy.conditionText, CONTRACTIONS), bullets: copy.bullets.map((b) => apply(b, CONTRACTIONS)) };
}

export function professional(copy: ListingCopy, ctx: TransformContext): ListingCopy {
  const out = mapModel(
    copy,
    (m) => {
      const mapped = mapText(m, (s) => capitalizeSentences(apply(s, EXPANSIONS)));
      const first = mapped.intro[0] ?? "";
      return { ...mapped, intro: [swapLead(first, "This listing is for a", ctx.itemName), ...mapped.intro.slice(1)] };
    },
    "professional",
  );
  return { ...out, conditionText: capitalizeSentences(apply(copy.conditionText, EXPANSIONS)), bullets: copy.bullets.map((b) => capitalizeSentences(apply(b, EXPANSIONS))) };
}

export function seo(copy: ListingCopy, ctx: TransformContext): ListingCopy {
  const brand = ctx.verifiedAttributes.find((a) => a.name === "Brand")?.value;
  const model = ctx.verifiedAttributes.find((a) => a.name === "Model")?.value;
  const color = ctx.verifiedAttributes.find((a) => a.name === "Color")?.value;
  const identity = [brand, model].filter((x): x is string => !!x);
  const typeWords = identity.length ? ctx.itemName.replace(new RegExp(`\\b(${identity.map(escapeRe).join("|")})\\b`, "gi"), "").replace(/\s+/g, " ").trim() : ctx.itemName;
  const built = [...identity, typeWords, color].filter((x): x is string => !!x && x.length > 0).join(" ");
  const title = fitTitle(ctx.alternates?.seoTitle ?? built, ctx.limits.titleMax);
  const vocabValues = (ctx.compsVocabulary ?? []).map((v) => (v.includes(":") ? v.split(":").slice(1).join(":").trim() : v)).filter((v) => v.length > 2);
  const consistent = vocabValues.filter((v) => ctx.verifiedAttributes.some((a) => a.value.toLowerCase().includes(v.toLowerCase()) || v.toLowerCase().includes(a.value.toLowerCase())) || ctx.itemName.toLowerCase().includes(v.toLowerCase()));
  const keywords = dedupe([...copy.keywords, ...consistent, ...copy.specifics.map((s) => s.value)]).slice(0, 15);
  const out = mapModel(copy, (m) => {
    const first = m.intro[0] ?? "";
    const needsName = !first.toLowerCase().includes((model ?? ctx.itemName).toLowerCase());
    return { ...m, intro: needsName ? [`${ctx.itemName}. ${first}`.trim(), ...m.intro.slice(1)] : m.intro };
  });
  return { ...out, title, keywords };
}

export function conditionFocus(copy: ListingCopy, ctx: TransformContext): ListingCopy {
  const label = gradeLabel(ctx.condition.grade);
  const suffix = ` – ${label}`;
  const title = copy.title.includes(suffix) ? copy.title : fitTitle(copy.title, ctx.limits.titleMax - suffix.length) + suffix;
  const defectLines = ctx.condition.defects.map((d) => `${capitalize(d.severity)} ${d.type.replace("_", " ")} on the ${lowerLead(d.location)}: ${lowerLead(d.description)}${d.evidenceImage ? ` (see photo ${d.evidenceImage})` : ""}.`);
  const conditionText = [`${label}. ${ctx.condition.summary.trim()}`, ...defectLines].join("\n");
  const out = mapModel(copy, (m) => {
    const cond = m.sections.find((s) => s.key === "condition");
    const others = m.sections.filter((s) => s.key !== "condition");
    const condSection = cond ?? { key: "condition" as const, heading: "Condition", lines: [] };
    condSection.lines = [`${label}. ${ctx.condition.summary.trim()}`, ...ctx.condition.defects.map((d) => `- ${capitalize(d.severity)} ${d.type.replace("_", " ")} on the ${lowerLead(d.location)}: ${lowerLead(d.description)}${d.evidenceImage ? ` (see photo ${d.evidenceImage})` : ""}`), ...condSection.lines.filter((l) => /^(Tested|Powers|Untested|Not working)/.test(l))];
    return { ...m, sections: [condSection, ...others] };
  });
  const lead = `${label} condition — ${ctx.condition.defects.length === 0 ? "no defects found" : `${ctx.condition.defects.length} ${ctx.condition.defects.length === 1 ? "defect" : "defects"} disclosed with photos`}`;
  return { ...out, title, conditionText, bullets: dedupe([lead, ...copy.bullets]) };
}

// ─────────────────────────── dispatcher ───────────────────────────

export function applyTone(copy: ListingCopy, tone: ListingTone | undefined, ctx: TransformContext): ListingCopy {
  switch (tone) {
    case "persuasive":
      return persuasive(copy, ctx);
    case "casual":
      return casual(copy, ctx);
    case "professional":
      return professional(copy, ctx);
    case "seo":
      return seo(copy, ctx);
    case "condition_focus":
      return conditionFocus(copy, ctx);
    default:
      return copy;
  }
}

export function applyLength(copy: ListingCopy, length: ListingLength | undefined, ctx: TransformContext): ListingCopy {
  if (length === "shorter") return shorten(copy, ctx);
  if (length === "longer") return lengthen(copy, ctx);
  return copy;
}

// ─────────────────────────── helpers ───────────────────────────

export function dedupe(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of list) {
    const k = s.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(s.trim());
  }
  return out;
}

function lowerLead(s: string): string {
  const t = s.replace(/\.$/, "");
  if (/^[A-Z]{2,}/.test(t) || /^[A-Z][a-z]*\d/.test(t) || /^[A-Z][a-z]+ [A-Z]/.test(t)) return t; // acronyms, model codes, proper names
  return t.charAt(0).toLowerCase() + t.slice(1);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export { ensurePeriod };
