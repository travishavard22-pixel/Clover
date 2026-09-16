/**
 * JSON-schema definitions for the Copilot's tools. Kept free of database access so they can be
 * validated in unit tests and shared with the Demo provider, which routes questions by tool name.
 * Names are a contract with `src/lib/ai/demo.ts` — do not rename.
 */
export const COPILOT_TOOL_NAMES = [
  "get_inventory_summary",
  "list_items",
  "get_item",
  "get_price_estimate",
  "get_offers",
  "get_marketplace_performance",
  "get_stale_listings",
  "propose_price_change",
  "rewrite_listing",
  "evaluate_offer",
] as const;
export type CopilotToolName = (typeof COPILOT_TOOL_NAMES)[number];

export type JsonSchema = {
  type: "object";
  properties: Record<string, Record<string, unknown>>;
  required: string[];
  additionalProperties: false;
};

const ITEM_STATUSES = ["DRAFT", "ANALYZING", "READY", "LISTED", "OFFER_RECEIVED", "SOLD", "SHIPPED", "COMPLETED", "ARCHIVED"] as const;
const MARKETPLACES = ["EBAY", "FACEBOOK", "OFFERUP", "NEXTDOOR", "CRAIGSLIST", "MERCARI", "POSHMARK"] as const;
const OFFER_STATUSES = ["PENDING", "ACCEPTED", "DECLINED", "COUNTERED", "EXPIRED", "WITHDRAWN"] as const;
export const LIST_SORTS = ["newest", "oldest", "price_desc", "price_asc", "days_on_market", "estimated_value"] as const;

export const COPILOT_TOOL_DEFINITIONS: Record<CopilotToolName, { description: string; inputSchema: JsonSchema; kind: "read" | "proposal" }> = {
  get_inventory_summary: {
    kind: "read",
    description: "Counts and totals for the seller's inventory: items by status, active listings, sold in the last 30 days, revenue, estimated inventory value, pending offers, best marketplace. Use first for any overview question.",
    inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  list_items: {
    kind: "read",
    description: "Lists the seller's items with price, estimate, status, days on market and offers. Filter by status or marketplace and sort. Returns at most `limit` items (default 20).",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "array", items: { type: "string", enum: [...ITEM_STATUSES] }, description: "Only items in these statuses" },
        marketplace: { type: "string", enum: [...MARKETPLACES], description: "Only items listed or sold on this marketplace" },
        sort: { type: "string", enum: [...LIST_SORTS], description: "Sort order; defaults to newest" },
        limit: { type: "integer", minimum: 1, maximum: 50, description: "Maximum items to return" },
      },
      required: [],
      additionalProperties: false,
    },
  },
  get_item: {
    kind: "read",
    description: "Everything Clover knows about one item: identification with confidence tiers, condition, price estimate and its basis, photos count, drafts, listings per marketplace, offers and price history.",
    inputSchema: { type: "object", properties: { id: { type: "string", description: "Item id" } }, required: ["id"], additionalProperties: false },
  },
  get_price_estimate: {
    kind: "read",
    description: "The price estimate for an item: quick-sale, recommended and maximum prices, the low/likely/high band, how many comparable listings were used, and whether it is market evidence or an AI estimate.",
    inputSchema: { type: "object", properties: { itemId: { type: "string" } }, required: ["itemId"], additionalProperties: false },
  },
  get_offers: {
    kind: "read",
    description: "Buyer offers across all items, newest first, with the asking price, floor price and how far below asking each offer is.",
    inputSchema: { type: "object", properties: { status: { type: "string", enum: [...OFFER_STATUSES], description: "Defaults to PENDING" } }, required: [], additionalProperties: false },
  },
  get_marketplace_performance: {
    kind: "read",
    description: "Per-marketplace results: items sold, revenue, active listings and sell-through, plus fee rates. Optionally narrowed to a category keyword such as 'electronics'.",
    inputSchema: { type: "object", properties: { category: { type: "string", description: "Optional category keyword to filter items by" } }, required: [], additionalProperties: false },
  },
  get_stale_listings: {
    kind: "read",
    description: "Listed items with no offers for at least `days` days (default 14), oldest first, with the current price, estimate and a suggested lower price.",
    inputSchema: { type: "object", properties: { days: { type: "integer", minimum: 1, maximum: 365 } }, required: [], additionalProperties: false },
  },
  propose_price_change: {
    kind: "proposal",
    description: "Proposes a new list price for an item. This NEVER changes anything: it returns a proposal card the seller must confirm. Explain the reasoning in `reason`.",
    inputSchema: {
      type: "object",
      properties: { itemId: { type: "string" }, newPriceCents: { type: "integer", minimum: 100, description: "New price in integer cents" }, reason: { type: "string", description: "One sentence on why" } },
      required: ["itemId", "newPriceCents"],
      additionalProperties: false,
    },
  },
  rewrite_listing: {
    kind: "proposal",
    description: "Drafts a rewritten title and description for an item following the instruction, using only verified attributes. Returns a proposal the seller must confirm; nothing is saved until then.",
    inputSchema: {
      type: "object",
      properties: { itemId: { type: "string" }, instruction: { type: "string", description: "What to change, e.g. 'shorter and more formal'" }, marketplace: { type: "string", enum: [...MARKETPLACES], description: "Which marketplace draft to rewrite; omit for the master draft" } },
      required: ["itemId", "instruction"],
      additionalProperties: false,
    },
  },
  evaluate_offer: {
    kind: "read",
    description: "Advice on a buyer offer: accept, counter or decline, with a suggested counter amount and message, grounded on the estimate, floor price, fees and days listed.",
    inputSchema: { type: "object", properties: { offerId: { type: "string" } }, required: ["offerId"], additionalProperties: false },
  },
};

/** Structural check used by tests and at start-up: every schema is an object schema whose required keys exist. */
export function validateToolSchema(schema: JsonSchema): string[] {
  const problems: string[] = [];
  if (schema.type !== "object") problems.push("type must be object");
  if (!schema.properties || typeof schema.properties !== "object") problems.push("properties missing");
  if (!Array.isArray(schema.required)) problems.push("required must be an array");
  for (const r of schema.required ?? []) if (!(r in (schema.properties ?? {}))) problems.push(`required key ${r} is not a property`);
  for (const [k, v] of Object.entries(schema.properties ?? {})) {
    if (typeof v.type !== "string") problems.push(`property ${k} has no type`);
    if (v.type === "array" && !v.items) problems.push(`array property ${k} has no items`);
  }
  if (schema.additionalProperties !== false) problems.push("additionalProperties must be false");
  return problems;
}
