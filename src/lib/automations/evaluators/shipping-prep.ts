import type { Evaluator, Proposal, ShippingPrepConfig, SnapshotItem, SnapshotPreferences } from "../types";
import { attr, attrBool, marketplaceName, money, shortTitle } from "./shared";

type PackingRule = { match: RegExp; box: string; protect: string[]; label?: string };

/** Category heuristics, most specific first. Matched against the category path, title and material. */
const RULES: PackingRule[] = [
  { match: /camera|lens|optic|binocular/i, box: "Double box with 2 in of padding between boxes", protect: ["Cap the lens and body", "Wrap in a lint-free cloth, then bubble wrap", "Remove the battery if it ships separately"], label: "Fragile" },
  { match: /phone|tablet|laptop|computer|console|electronic|audio|headphone|speaker|monitor|tv\b/i, box: "Sturdy box at least 2 in larger than the item on every side", protect: ["Anti-static bag or original box", "Bubble wrap around corners and screen", "Coil cables and bag accessories separately"], label: "Fragile" },
  { match: /glass|ceramic|porcelain|pottery|vase|china|crystal|mirror|frame/i, box: "Double box; the inner box floats in 2–3 in of padding", protect: ["Wrap each piece separately", "Fill hollow pieces with paper", "No item should touch the box wall"], label: "Fragile — this side up" },
  { match: /vinyl|record|lp\b/i, box: "Record mailer with stiffeners", protect: ["Remove the disc from the sleeve to prevent seam splits", "Cardboard on both sides"], label: "Do not bend" },
  { match: /book|comic|magazine|manual|dvd|blu-ray|game/i, box: "Rigid cardboard mailer or small box", protect: ["Bag in plastic against rain", "Cardboard stiffener behind thin items"], label: "Do not bend" },
  { match: /shoe|sneaker|boot|heel/i, box: "The original shoe box inside a shipping box, or a box with 1 in clearance", protect: ["Stuff toes with paper to hold shape", "Bag each shoe"] },
  { match: /clothing|apparel|shirt|jacket|dress|jeans|pants|sweater|coat|hoodie/i, box: "Poly mailer (or a box for structured pieces like coats and blazers)", protect: ["Fold with tissue at the creases", "Bag against moisture"] },
  { match: /watch|jewel|ring|necklace|bracelet/i, box: "Small padded box inside a shipping box — never a mailer alone", protect: ["Wrap in a soft cloth", "Add signature confirmation above $250"] },
  { match: /toy|lego|figure|doll|plush/i, box: "Box with 1–2 in of padding", protect: ["Bag loose pieces", "Photograph the contents before sealing"] },
  { match: /tool|hardware|drill|saw|wrench/i, box: "Heavy-duty box; tape every seam", protect: ["Remove or tape down batteries and blades", "Wrap sharp edges in cardboard"], label: "Heavy" },
  { match: /furniture|chair|table|lamp|desk|shelf/i, box: "Oversize — measure boxed dimensions before buying a label", protect: ["Detach legs and shade where possible", "Corner protectors and stretch wrap"], label: "Oversize" },
];

const DEFAULT_RULE: PackingRule = { box: "Sturdy box with 2 in of padding on every side", protect: ["Wrap the item", "Fill voids so nothing shifts"], match: /.*/ };

function parseInches(dim: string): number[] {
  return [...dim.matchAll(/(\d+(?:\.\d+)?)\s*(?:in|inch|inches|")/gi)].map((m) => Number(m[1])).filter((n) => Number.isFinite(n));
}

export type ShippingNote = { note: string; checklist: string[]; rule: string };

/** Pure: the packing and shipping note for a sold item. */
export function buildShippingNote(item: SnapshotItem, prefs: SnapshotPreferences, config: ShippingPrepConfig): ShippingNote {
  const haystack = [...item.categoryPath, item.title, item.profile?.material ?? "", item.profile?.itemName ?? ""].join(" ");
  const rule = RULES.find((r) => r.match.test(haystack)) ?? DEFAULT_RULE;
  const checklist: string[] = [];
  checklist.push(`Box: ${rule.box}`);
  checklist.push(...rule.protect);

  const dims = item.profile?.dimensions;
  if (config.includeDimensions && dims) {
    const inches = parseInches(dims);
    const longest = inches.length ? Math.max(...inches) : null;
    checklist.push(`Measured: ${dims}${longest && longest > 24 ? " — over 24 in, check oversize surcharges" : ""}`);
  }
  if (item.conditionGrade === "FOR_PARTS" || item.conditionGrade === "FAIR") checklist.push("Photograph the known defects before packing in case of a dispute");

  const buyer = attr(item, "buyerName");
  const m = item.soldMarketplace;
  if (m === "EBAY") checklist.push("Buy and print the label from the eBay order page so tracking uploads automatically");
  else if (m === "FACEBOOK") checklist.push("Use the Marketplace shipping label if the buyer paid with checkout; local pickups need no label");
  else if (m === "OFFERUP") checklist.push("Print the OfferUp prepaid label from the app within 3 days");
  else if (m) checklist.push(`Arrange the handoff or label on ${marketplaceName(m)}`);
  else checklist.push("Confirm shipping or pickup with the buyer");
  checklist.push("Ship within 2 business days and share the tracking number");

  const head = `Pack ${item.title}${buyer ? ` for ${buyer}` : ""}${item.soldPrice !== null ? ` (${money(item.soldPrice)})` : ""}.`;
  const label = rule.label ? ` Label the box "${rule.label}".` : "";
  const personal = prefs.defaultShippingNote ? ` Your note: ${prefs.defaultShippingNote}` : "";
  const note = `${head} ${rule.box}. ${rule.protect.join("; ")}.${label}${personal}`;
  return { note, checklist, rule: rule.match.source === ".*" ? "default" : rule.match.source };
}

export const evaluateShippingPrep: Evaluator<"SHIPPING_PREP"> = (ctx, config: ShippingPrepConfig): Proposal[] => {
  const out: Proposal[] = [];
  for (const item of ctx.items) {
    if (item.status !== "SOLD") continue;
    if (attrBool(item, "soldLocal") === true) continue;
    if (attr(item, "shippingNote")) continue;
    if (!ctx.preferences.offersShipping && item.soldMarketplace === "NEXTDOOR") continue;
    const built = buildShippingNote(item, ctx.preferences, config);
    out.push({
      type: "SHIPPING_PREP",
      itemId: item.id,
      title: `Packing note for ${shortTitle(item.title)}`,
      body: built.note,
      proposal: { key: `ship:${item.id}:${item.soldAt ?? ""}`, action: "set_shipping_note", itemId: item.id, note: built.note, checklist: built.checklist },
      autoExecutable: true,
      notifyPreference: "notifyPublishing",
    });
  }
  return out;
};
