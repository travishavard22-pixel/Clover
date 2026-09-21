import type { AutomationMode, AutomationType, ConditionGrade, ItemStatus, Marketplace, PhotoKind, PublicationMode, PublicationStatus, OfferStatus, StudioMode, EstimateBasis, ConfidenceTier } from "../db";

/**
 * Pure, serialisable snapshot of a seller's data that evaluators run over. Built by
 * `snapshot.ts` from the database, or by tests from fixtures. Evaluators never touch the DB.
 */
export type SnapshotPhoto = {
  id: string;
  kind: PhotoKind;
  width: number;
  height: number;
  sortOrder: number;
  aiGenerated: boolean;
  studioMode: StudioMode | null;
};

export type SnapshotEstimate = {
  quickSale: number;
  recommended: number;
  maxValue: number;
  confidence: ConfidenceTier;
  basis: EstimateBasis;
};

export type SnapshotDraft = {
  id: string;
  marketplace: Marketplace | null;
  title: string;
  /** The listing writer's own claim check. "pass" means nothing in the copy is unsupported. */
  selfCheckVerdict: "pass" | "revise" | "reject" | null;
  updatedAt: string;
};

export type SnapshotPublication = {
  id: string;
  marketplace: Marketplace;
  mode: PublicationMode;
  status: PublicationStatus;
  price: number | null;
  externalUrl: string | null;
  /** `attention.code` when the publication carries an attention record (e.g. "double_sell_guard"). */
  attentionCode: string | null;
  publishedAt: string | null;
  updatedAt: string;
};

export type SnapshotOffer = {
  id: string;
  marketplace: Marketplace;
  /** How the listing was published. Clover can only answer offers on an API publication. */
  publicationMode: PublicationMode | null;
  buyerName: string;
  amount: number;
  originalPrice: number;
  status: OfferStatus;
  receivedAt: string;
  expiresAt: string | null;
  message: string | null;
};

/** The subset of the identification artifact automations care about. */
export type SnapshotProfile = {
  itemName: string | null;
  /** 0–1, as the identification reported it. Null when no identification has been stored. */
  identityConfidence: number | null;
  brand: string | null;
  model: string | null;
  dimensions: string | null;
  material: string | null;
};

export type SnapshotItem = {
  id: string;
  sku: string;
  title: string;
  status: ItemStatus;
  brand: string | null;
  model: string | null;
  categoryPath: string[];
  conditionGrade: ConditionGrade | null;
  attributes: Record<string, unknown>;
  listPrice: number | null;
  floorPrice: number | null;
  estimatedValue: number | null;
  soldPrice: number | null;
  soldMarketplace: Marketplace | null;
  quantity: number;
  notes: string | null;
  listedAt: string | null;
  soldAt: string | null;
  createdAt: string;
  updatedAt: string;
  photos: SnapshotPhoto[];
  profile: SnapshotProfile | null;
  estimate: SnapshotEstimate | null;
  drafts: SnapshotDraft[];
  publications: SnapshotPublication[];
  offers: SnapshotOffer[];
};

/** A marketplace connection, as the seller has it set up today. */
export type SnapshotConnection = {
  marketplace: Marketplace;
  status: string;
  /** "api", "assisted" or "demo" — what Clover can actually do on this marketplace. */
  mode: string;
};

export type SnapshotPreferences = {
  offersShipping: boolean;
  offersLocalPickup: boolean;
  defaultShippingNote: string | null;
  /** Where the seller lists by default, in their own order. */
  defaultMarketplaces: Marketplace[];
  notifyOffers: boolean;
  notifyStale: boolean;
  notifyPublishing: boolean;
  city: string | null;
};

export type EvaluationContext = {
  now: Date;
  items: SnapshotItem[];
  preferences: SnapshotPreferences;
  connections: SnapshotConnection[];
  /** Modes of every rule, so evaluators can adapt (e.g. the double-sell guard covers for a disabled sold sync). */
  modes: Record<AutomationType, AutomationMode>;
};

// ───────────────────────────── Proposals ─────────────────────────────

/** A concrete change a recommendation can apply. Every action is scoped to the owning user at apply time. */
export type ProposalAction =
  | { action: "reprice"; itemId: string; fromCents: number; toCents: number; publicationIds: string[]; apiPublicationIds: string[]; reason: string }
  | { action: "end_listings"; itemId: string; publicationIds: string[]; keepMarketplace: Marketplace | null; reason: "sold_elsewhere" | "withdrawn" }
  | { action: "fix_title"; itemId: string; draftId: string | null; marketplace: Marketplace | null; fromTitle: string; toTitle: string; issues: string[] }
  | { action: "set_shipping_note"; itemId: string; note: string; checklist: string[] }
  | { action: "respond_offer"; itemId: string; offerId: string; response: "accept" | "decline" | "counter"; counterCents: number | null; offerCents: number; askCents: number; reason: string }
  | { action: "publish"; itemId: string; marketplaces: Marketplace[]; priceCents: number; reason: string }
  | { action: "notify"; itemId: string | null; href: string }
  | { action: "review"; itemId: string; href: string; checklist: string[] };

export type ProposalPayload = {
  /** Stable identity of this exact proposal, used for de-duplication across runs. */
  key: string;
} & ProposalAction;

export type Proposal = {
  type: AutomationType;
  itemId: string | null;
  title: string;
  body: string;
  proposal: ProposalPayload;
  /** Whether the engine may execute this without asking when the rule is in AUTO mode. */
  autoExecutable: boolean;
  /** Short reason shown when AUTO is requested but not possible for this proposal. */
  autoBlockedReason?: string;
  /** Which notification preference gates the alert for this proposal. */
  notifyPreference: keyof Pick<SnapshotPreferences, "notifyOffers" | "notifyStale" | "notifyPublishing"> | null;
};

// ───────────────────────────── Config ─────────────────────────────

export type RepriceConfig = { days: number; stepPercent: number; allowBelowQuickSale: boolean; minDropCents: number };
export type StaleListingConfig = { days: number };
export type PhotoQualityConfig = { minPhotos: number; minEdgePx: number; requireStudioCover: boolean };
export type TitleQualityConfig = { requireBrand: boolean; requireModel: boolean; flagAllCaps: boolean; flagFiller: boolean };
export type OfferAlertConfig = { onlyAboveFloor: boolean };
/**
 * Offer autopilot. Percentages are of the asking price; the floor price is an absolute stop that
 * overrides them, and `maxAutoAcceptCents` is the ceiling above which an offer is always left for
 * a person — a guard against a mistyped price rather than against a buyer.
 */
export type OfferAutopilotConfig = {
  acceptAtOrAbovePercent: number;
  counterPercent: number;
  declineBelowFloor: boolean;
  maxAutoAcceptCents: number;
};
/**
 * Auto-publish. Every threshold is a reason to *stop*: an item is only listed when the
 * identification, the price and the copy are all strong enough that a person reviewing it would
 * have pressed the button unchanged.
 */
export type AutoPublishConfig = {
  minIdentityConfidencePercent: number;
  minPhotos: number;
  requireMarketEvidence: boolean;
  requireSelfCheckPass: boolean;
  requireFloorPrice: boolean;
};
export type SoldSyncConfig = { includeAssisted: boolean };
export type DoubleSellGuardConfig = { graceHours: number };
export type ShippingPrepConfig = { includeDimensions: boolean };
export type PendingActionConfig = { publicationHours: number; draftDays: number };

export type AutomationConfigMap = {
  REPRICE_STALE: RepriceConfig;
  STALE_LISTING: StaleListingConfig;
  PHOTO_QUALITY: PhotoQualityConfig;
  TITLE_QUALITY: TitleQualityConfig;
  OFFER_ALERT: OfferAlertConfig;
  OFFER_AUTOPILOT: OfferAutopilotConfig;
  AUTO_PUBLISH: AutoPublishConfig;
  SOLD_SYNC: SoldSyncConfig;
  DOUBLE_SELL_GUARD: DoubleSellGuardConfig;
  SHIPPING_PREP: ShippingPrepConfig;
  PENDING_ACTION_REMINDER: PendingActionConfig;
};

export type AutomationConfig = AutomationConfigMap[AutomationType];

export type Evaluator<T extends AutomationType> = (ctx: EvaluationContext, config: AutomationConfigMap[T]) => Proposal[];

/** Describes one configurable parameter for the Configure disclosure in the UI. */
export type ConfigField =
  | { key: string; label: string; kind: "number"; min: number; max: number; step?: number; unit?: string; help?: string }
  | { key: string; label: string; kind: "boolean"; help?: string };

export type AutomationDefinition<T extends AutomationType = AutomationType> = {
  type: T;
  name: string;
  /** One line, in the product's voice. */
  description: string;
  /** What each mode means for this automation, in plain language. */
  modeHelp: Partial<Record<AutomationMode, string>>;
  supportedModes: AutomationMode[];
  defaultMode: AutomationMode;
  /** Why AUTO (or OFF) is not available, shown next to the disabled option. */
  unsupportedReason?: Partial<Record<AutomationMode, string>>;
  /** Shown as a warning when the user picks AUTO. */
  autoWarning?: string;
  defaultConfig: AutomationConfigMap[T];
  fields: ConfigField[];
  /** True when the automation cannot be switched off. */
  alwaysOn: boolean;
};

export const AUTOMATION_TYPES: AutomationType[] = [
  "REPRICE_STALE",
  "STALE_LISTING",
  "PHOTO_QUALITY",
  "TITLE_QUALITY",
  "OFFER_ALERT",
  "OFFER_AUTOPILOT",
  "AUTO_PUBLISH",
  "SOLD_SYNC",
  "DOUBLE_SELL_GUARD",
  "SHIPPING_PREP",
  "PENDING_ACTION_REMINDER",
];

export const AUTOMATION_MODES: AutomationMode[] = ["OFF", "SUGGEST", "ASK", "AUTO"];

export const MODE_LABELS: Record<AutomationMode, string> = {
  OFF: "Off",
  SUGGEST: "Suggestions only",
  ASK: "Ask before changing",
  AUTO: "Automatic",
};
