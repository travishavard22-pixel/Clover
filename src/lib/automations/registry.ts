import { z } from "zod";
import type { AutomationMode, AutomationType } from "../db";
import type { AutomationConfig, AutomationConfigMap, AutomationDefinition } from "./types";
import { AUTOMATION_TYPES } from "./types";

/**
 * The nine automations. Descriptions are the product copy shown in the Automation center.
 * AUTO is offered only where the action is reversible or purely informational; everywhere else
 * the most Clover will do is ask.
 */
export const AUTOMATIONS: { [T in AutomationType]: AutomationDefinition<T> } = {
  REPRICE_STALE: {
    type: "REPRICE_STALE",
    name: "Smart Repricing",
    description: "Automatically recommend a new price after 14 days without an offer.",
    modeHelp: {
      SUGGEST: "A price suggestion appears in Needs attention. Nothing changes until you apply it.",
      ASK: "Clover proposes the price and asks you to approve it.",
      AUTO: "Clover lowers the price on marketplaces with an API (eBay) and tells you. Assisted listings still ask first.",
    },
    supportedModes: ["OFF", "SUGGEST", "ASK", "AUTO"],
    defaultMode: "SUGGEST",
    autoWarning: "Automatic price changes apply to API marketplaces only and never go below your floor price or the quick-sale estimate.",
    defaultConfig: { days: 14, stepPercent: 8, allowBelowQuickSale: false, minDropCents: 100 },
    fields: [
      { key: "days", label: "Days without an offer", kind: "number", min: 3, max: 90, unit: "days" },
      { key: "stepPercent", label: "Price step", kind: "number", min: 1, max: 30, unit: "%", help: "How much to lower the price each time." },
      { key: "allowBelowQuickSale", label: "Allow going below the quick-sale estimate", kind: "boolean", help: "Your floor price is always respected." },
      { key: "minDropCents", label: "Smallest drop", kind: "number", min: 0, max: 10000, step: 100, unit: "cents", help: "Skip drops smaller than this." },
    ],
    alwaysOn: false,
  },
  STALE_LISTING: {
    type: "STALE_LISTING",
    name: "Stale listing check",
    description: "Flag listings that have gone quiet so you can refresh, relist or reconsider them.",
    modeHelp: {
      SUGGEST: "Stale listings appear in Needs attention.",
      ASK: "Clover also sends you a notification.",
    },
    supportedModes: ["OFF", "SUGGEST", "ASK"],
    defaultMode: "SUGGEST",
    unsupportedReason: { AUTO: "Refreshing a listing needs your judgement, so this one never runs on its own." },
    defaultConfig: { days: 30 },
    fields: [{ key: "days", label: "Quiet for", kind: "number", min: 7, max: 180, unit: "days" }],
    alwaysOn: false,
  },
  PHOTO_QUALITY: {
    type: "PHOTO_QUALITY",
    name: "Photo quality",
    description: "Point out listings with too few, low-resolution or unstyled photos.",
    modeHelp: { SUGGEST: "Photo suggestions appear on the item and in Needs attention." },
    supportedModes: ["OFF", "SUGGEST"],
    defaultMode: "SUGGEST",
    unsupportedReason: { ASK: "Photos are yours to take; Clover only suggests.", AUTO: "Clover never changes your photos on its own." },
    defaultConfig: { minPhotos: 3, minEdgePx: 800, requireStudioCover: true },
    fields: [
      { key: "minPhotos", label: "Minimum photos", kind: "number", min: 1, max: 12 },
      { key: "minEdgePx", label: "Minimum resolution", kind: "number", min: 400, max: 2000, step: 100, unit: "px" },
      { key: "requireStudioCover", label: "Cover should be a studio or enhanced photo", kind: "boolean" },
    ],
    alwaysOn: false,
  },
  TITLE_QUALITY: {
    type: "TITLE_QUALITY",
    name: "Title quality",
    description: "Catch titles missing the brand or model, shouting in capitals or padded with filler.",
    modeHelp: { SUGGEST: "A corrected title is suggested. Apply it with one tap." },
    supportedModes: ["OFF", "SUGGEST"],
    defaultMode: "SUGGEST",
    unsupportedReason: { ASK: "Title changes are quick to review, so Clover only suggests.", AUTO: "Live titles are never rewritten without you." },
    defaultConfig: { requireBrand: true, requireModel: true, flagAllCaps: true, flagFiller: true },
    fields: [
      { key: "requireBrand", label: "Brand should appear in the title", kind: "boolean" },
      { key: "requireModel", label: "Model should appear in the title", kind: "boolean" },
      { key: "flagAllCaps", label: "Flag ALL-CAPS titles", kind: "boolean" },
      { key: "flagFiller", label: "Flag filler words (L@@K, WOW, must see…)", kind: "boolean" },
    ],
    alwaysOn: false,
  },
  OFFER_ALERT: {
    type: "OFFER_ALERT",
    name: "Offer alerts",
    description: "Tell you the moment a buyer makes an offer, with how it compares to your floor.",
    modeHelp: { SUGGEST: "New offers appear in Needs attention.", AUTO: "You get a notification for every new offer." },
    supportedModes: ["OFF", "SUGGEST", "AUTO"],
    defaultMode: "AUTO",
    unsupportedReason: { ASK: "An alert has nothing to approve." },
    defaultConfig: { onlyAboveFloor: false },
    fields: [{ key: "onlyAboveFloor", label: "Only alert for offers at or above my floor price", kind: "boolean" }],
    alwaysOn: false,
  },
  SOLD_SYNC: {
    type: "SOLD_SYNC",
    name: "Sold sync",
    description: "When an item sells on one marketplace, end its listings everywhere else.",
    modeHelp: {
      SUGGEST: "Clover lists the other live listings for you to end.",
      ASK: "Clover asks before ending them.",
      AUTO: "Clover ends API listings itself and asks you to end assisted ones.",
    },
    supportedModes: ["OFF", "SUGGEST", "ASK", "AUTO"],
    defaultMode: "ASK",
    autoWarning: "Ending a listing cannot be undone from Clover. eBay listings are ended through the API; Facebook, OfferUp and other assisted listings still need you.",
    defaultConfig: { includeAssisted: true },
    fields: [{ key: "includeAssisted", label: "Include assisted marketplaces in the checklist", kind: "boolean" }],
    alwaysOn: false,
  },
  DOUBLE_SELL_GUARD: {
    type: "DOUBLE_SELL_GUARD",
    name: "Double-sell guard",
    description: "Make sure an item is sold only once, even when listings are live on several marketplaces.",
    modeHelp: { ASK: "Clover warns you and asks before ending anything.", AUTO: "Clover ends API listings itself the moment an offer is accepted or a sale is recorded." },
    supportedModes: ["ASK", "AUTO"],
    defaultMode: "ASK",
    unsupportedReason: { OFF: "This guard always runs. It is how Clover keeps an item sold only once.", SUGGEST: "A guard that only suggests is not a guard." },
    autoWarning: "Ending a listing cannot be undone from Clover.",
    defaultConfig: { graceHours: 2 },
    fields: [{ key: "graceHours", label: "Grace period after a sale", kind: "number", min: 0, max: 72, unit: "hours", help: "How long to wait for Sold sync before the guard steps in." }],
    alwaysOn: true,
  },
  SHIPPING_PREP: {
    type: "SHIPPING_PREP",
    name: "Shipping prep",
    description: "Write a packing and shipping note the moment an item sells.",
    modeHelp: { SUGGEST: "The note is suggested on the item.", AUTO: "The note is saved to the item and you are told." },
    supportedModes: ["OFF", "SUGGEST", "AUTO"],
    defaultMode: "AUTO",
    unsupportedReason: { ASK: "A note is harmless to generate, so there is nothing to approve." },
    defaultConfig: { includeDimensions: true },
    fields: [{ key: "includeDimensions", label: "Include measured dimensions when known", kind: "boolean" }],
    alwaysOn: false,
  },
  PENDING_ACTION_REMINDER: {
    type: "PENDING_ACTION_REMINDER",
    name: "Pending action reminders",
    description: "Remind you about assisted listings you have not finished and drafts that are waiting.",
    modeHelp: { SUGGEST: "Reminders appear in Needs attention.", AUTO: "You also get a notification." },
    supportedModes: ["OFF", "SUGGEST", "AUTO"],
    defaultMode: "AUTO",
    unsupportedReason: { ASK: "A reminder has nothing to approve." },
    defaultConfig: { publicationHours: 24, draftDays: 3 },
    fields: [
      { key: "publicationHours", label: "Unfinished assisted listing after", kind: "number", min: 1, max: 168, unit: "hours" },
      { key: "draftDays", label: "Waiting draft after", kind: "number", min: 1, max: 60, unit: "days" },
    ],
    alwaysOn: false,
  },
};

export const AUTOMATION_LIST = AUTOMATION_TYPES.map((t) => AUTOMATIONS[t] as AutomationDefinition);

export function automationName(type: AutomationType): string {
  return AUTOMATIONS[type].name;
}

export function isModeSupported(type: AutomationType, mode: AutomationMode): boolean {
  return (AUTOMATIONS[type].supportedModes as AutomationMode[]).includes(mode);
}

// ───────────────────────────── Config validation ─────────────────────────────

const bool = z.boolean();
const int = (min: number, max: number) => z.number().int().min(min).max(max);

export const CONFIG_SCHEMAS: { [T in AutomationType]: z.ZodType<AutomationConfigMap[T]> } = {
  REPRICE_STALE: z.object({ days: int(3, 90), stepPercent: int(1, 30), allowBelowQuickSale: bool, minDropCents: int(0, 10000) }),
  STALE_LISTING: z.object({ days: int(7, 180) }),
  PHOTO_QUALITY: z.object({ minPhotos: int(1, 12), minEdgePx: int(400, 2000), requireStudioCover: bool }),
  TITLE_QUALITY: z.object({ requireBrand: bool, requireModel: bool, flagAllCaps: bool, flagFiller: bool }),
  OFFER_ALERT: z.object({ onlyAboveFloor: bool }),
  SOLD_SYNC: z.object({ includeAssisted: bool }),
  DOUBLE_SELL_GUARD: z.object({ graceHours: int(0, 72) }),
  SHIPPING_PREP: z.object({ includeDimensions: bool }),
  PENDING_ACTION_REMINDER: z.object({ publicationHours: int(1, 168), draftDays: int(1, 60) }),
};

/** Merges a stored (possibly partial or stale) config over the defaults and validates it. Invalid fields fall back to defaults. */
export function resolveConfig<T extends AutomationType>(type: T, stored: unknown): AutomationConfigMap[T] {
  const defaults = AUTOMATIONS[type].defaultConfig as AutomationConfigMap[T];
  const merged = { ...defaults, ...(stored && typeof stored === "object" ? (stored as Record<string, unknown>) : {}) };
  const parsed = CONFIG_SCHEMAS[type].safeParse(merged);
  if (parsed.success) return parsed.data as AutomationConfigMap[T];
  // Keep the valid keys, reset the invalid ones.
  const out: Record<string, unknown> = { ...defaults };
  for (const [k, v] of Object.entries(merged)) {
    const single = CONFIG_SCHEMAS[type].safeParse({ ...defaults, [k]: v });
    if (single.success) out[k] = v;
  }
  return out as AutomationConfigMap[T];
}

/** Strictly validates a config patch from the client. Throws a ZodError on bad input. */
export function parseConfigPatch<T extends AutomationType>(type: T, current: AutomationConfigMap[T], patch: unknown): AutomationConfigMap[T] {
  const merged = { ...current, ...(patch && typeof patch === "object" ? (patch as Record<string, unknown>) : {}) };
  return CONFIG_SCHEMAS[type].parse(merged) as AutomationConfigMap[T];
}

export type AnyAutomationConfig = AutomationConfig;
