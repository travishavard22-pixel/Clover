import type { ItemProfile, ListingCopy, SelfCheck } from "../ai/schemas";
import { tokenize } from "../pricing/engine";
import { gradeLabel } from "../pricing/condition";
import { functionalLine, type ShippingContext } from "./compose";

/**
 * Deterministic closed-world fact check (research §4.1 rule 5). Every bullet, specific, the title
 * and each condition sentence is a claim; a claim is supported when its meaningful tokens appear in
 * the verified facts. It is intentionally strict about *new* nouns and lenient about phrasing, so a
 * transform that reorders or rewords the same facts passes while one that adds a material, size,
 * accessory or working-condition claim does not.
 */

export type Facts = {
  /** The identified item name. Always a fact for the listing: the seller confirms identity on the review page. */
  itemName: string;
  verifiedAttributes: Array<{ name: string; value: string }>;
  condition: ItemProfile["condition"];
  accessoriesIncluded: string[];
  possiblyMissing: string[];
  unknowns: string[];
  shipping: ShippingContext;
  priceCents?: number | null;
};

/** Words that never count as a factual claim on their own. */
const GENERIC = new Set(
  `about above accordingly across after again all almost also always any anyone anything are around as ask asked available away back be because been before being below best better between both buyer buyers buying can care check checkout clean come comes contact could daily day days deal detail details disclosed do does dont each else every everything exactly first for from get gets go going good great had hand handoff has have having head heads here hidden hold holding home honest how if in include included includes including info into is it item items its just keep kind last light like listed listing local look looking lot made make makes many may me meet more most much my need needs next no not note nothing now of off offers often ok on one only or other our out over own owner part pay payment perfect photo photos pick picked pictured pictures please plenty popular price priced pull put question questions ready really review right same see seen sell seller selling sells set shape shipped ships shipping should show shown shows since so sold some someone something soon start still sure take taking tell than thank thanks that the their them then there these they thing things this those through time to today too two under up upon use used useful using usual very want was way we welcome well what when where whether which while who why will with within without wont work works would year years you your yours
  as-is asis unverified verify verified independently please read below above disclosed described covered noted mentioned`
    .split(/\s+/)
    .filter(Boolean),
);

function factTokens(facts: Facts): { tokens: Set<string>; joined: string; sources: Array<{ name: string; tokens: Set<string> }> } {
  const sources: Array<{ name: string; tokens: Set<string> }> = [];
  const add = (name: string, text: string) => {
    const t = new Set(tokenize(text));
    sources.push({ name, tokens: t });
  };
  add("item name", facts.itemName);
  for (const a of facts.verifiedAttributes) add(a.name, `${a.name} ${a.value}`);
  add("condition report", `${gradeLabel(facts.condition.grade)} ${facts.condition.summary} ${facts.condition.functionalStatus.replace("_", " ")} ${facts.condition.grade.replace("_", " ")} ${functionalLine(facts.condition.functionalStatus) ?? ""} ${facts.condition.defects.length} defects disclosed photos`);
  for (const d of facts.condition.defects) add("condition report", `${d.severity} ${d.type.replace("_", " ")} ${d.location} ${d.description} photo ${d.evidenceImage ?? ""}`);
  add("accessories included", facts.accessoriesIncluded.join(" "));
  add("not shown", facts.possiblyMissing.join(" "));
  add("unknowns", facts.unknowns.join(" "));
  add("shipping info", `${facts.shipping.city ?? ""} ${facts.shipping.note ?? ""} ${facts.shipping.offersShipping ? "ships shipping checkout business days label" : ""} ${facts.shipping.offersLocalPickup ? "local pickup cash app" : ""} handoff meet`);
  if (facts.priceCents) add("price", `${Math.round(facts.priceCents / 100)}`);
  const tokens = new Set<string>();
  for (const s of sources) for (const t of s.tokens) tokens.add(t);
  return { tokens, joined: [...tokens].join(" "), sources };
}

function meaningful(claim: string): string[] {
  return tokenize(claim).filter((t) => !GENERIC.has(t) && !/^\d{1,2}$/.test(t));
}

function supportedBy(tokens: string[], facts: ReturnType<typeof factTokens>): { supported: boolean; source: string | null } {
  if (tokens.length === 0) return { supported: true, source: null };
  let matched = 0;
  let source: string | null = null;
  for (const t of tokens) {
    const hit = facts.tokens.has(t) || (t.length >= 4 && facts.joined.includes(t)) || [...facts.tokens].some((f) => f.length >= 4 && (f.includes(t) || t.includes(f)) && Math.min(f.length, t.length) >= 4);
    if (hit) {
      matched++;
      if (!source) source = facts.sources.find((s) => s.tokens.has(t) || [...s.tokens].some((f) => f.length >= 4 && (f.includes(t) || t.includes(f))))?.name ?? null;
    }
  }
  // Short claims (1–2 meaningful words) must match fully; longer ones need a clear majority.
  const need = tokens.length <= 2 ? tokens.length : Math.ceil(tokens.length * 0.6);
  return { supported: matched >= need, source };
}

const SENSITIVE = /\b(authentic|genuine|warranty|guarantee|guaranteed|works perfectly|fully working|fully functional|tested working|complete set|all original|brand new|sealed|never used)\b/i;

export function checkListingClaims(facts: Facts, copy: ListingCopy): SelfCheck {
  const ft = factTokens(facts);
  const claims: SelfCheck["claims"] = [];
  const push = (claim: string) => {
    const text = claim.replace(/^[-•]\s*/, "").trim();
    if (!text) return;
    const r = supportedBy(meaningful(text), ft);
    claims.push({ claim: text, supported: r.supported, source: r.source });
  };
  push(copy.title);
  for (const b of copy.bullets) push(b);
  for (const s of copy.specifics) push(`${s.name}: ${s.value}`);
  for (const line of copy.conditionText.split(/\n+/)) push(line);

  const unsupported = claims.filter((c) => !c.supported);
  const sensitive = unsupported.some((c) => SENSITIVE.test(c.claim));
  const verdict: SelfCheck["verdict"] = unsupported.length === 0 ? "pass" : unsupported.length <= 2 && !sensitive ? "revise" : "reject";
  return { claims, unsupportedCount: unsupported.length, verdict };
}
