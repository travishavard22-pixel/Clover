import type { ConditionGrade, ConfidenceTier, EstimateBasis, ItemStatus, Marketplace, PublicationMode, PublicationStatus } from "../db";

export const SORT_KEYS = ["newest", "oldest", "price_desc", "price_asc", "days_on_market", "estimated_value"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export const SORT_LABELS: Record<SortKey, string> = {
  newest: "Newest",
  oldest: "Oldest",
  price_desc: "Price: high to low",
  price_asc: "Price: low to high",
  days_on_market: "Days on market",
  estimated_value: "Estimated value",
};

export type ListFilters = {
  q?: string;
  status?: ItemStatus[];
  marketplace?: Marketplace;
  sort?: SortKey;
  cursor?: string | null;
  limit?: number;
  /** Include archived items even when no status filter names them. */
  includeArchived?: boolean;
};

export type PublicationSummary = {
  id: string;
  marketplace: Marketplace;
  mode: PublicationMode;
  status: PublicationStatus;
  externalUrl: string | null;
};

export type CoverPhoto = { id: string; url: string; thumbUrl: string; width: number; height: number; aiGenerated: boolean };

/** Client-safe list row with computed fields. Dates are ISO strings. */
export type ItemListDTO = {
  id: string;
  sku: string;
  title: string;
  status: ItemStatus;
  brand: string | null;
  model: string | null;
  categoryPath: string[];
  conditionGrade: ConditionGrade | null;
  conditionNotes: string | null;
  attributes: Record<string, unknown>;
  acquisitionCost: number | null;
  estimatedValue: number | null;
  listPrice: number | null;
  floorPrice: number | null;
  soldPrice: number | null;
  fees: number | null;
  shippingCost: number | null;
  soldMarketplace: Marketplace | null;
  storageLocation: string | null;
  notes: string | null;
  quantity: number;
  acquiredAt: string | null;
  listedAt: string | null;
  soldAt: string | null;
  createdAt: string;
  updatedAt: string;
  cover: CoverPhoto | null;
  photoCount: number;
  publications: PublicationSummary[];
  pendingOffers: number;
  estimate: { basis: EstimateBasis; confidence: ConfidenceTier; recommended: number } | null;
  daysOnMarket: number | null;
  profit: number | null;
  estimatedProfit: number | null;
};

export type ListResult = { items: ItemListDTO[]; nextCursor: string | null };

export type AttentionKind = "offer" | "publication" | "recommendation" | "stale" | "draft" | "connection";

export type AttentionRow = {
  id: string;
  kind: AttentionKind;
  severity: 1 | 2 | 3; // 1 = act now, 3 = when you can
  title: string;
  body: string;
  href: string;
  actionLabel: string;
  itemId: string | null;
  itemTitle: string | null;
  cover: CoverPhoto | null;
  marketplace: Marketplace | null;
  amount: number | null;
  at: string;
};
