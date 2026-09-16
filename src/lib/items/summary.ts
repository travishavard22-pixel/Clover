import { parseStoredProfile, type StoredProfile } from "../ai/profile-edit";
import { db, type ConditionGrade, type ItemStatus, type Marketplace, type PricingStrategy } from "../db";
import { publicCapabilities, type Capabilities } from "../env";
import { latestPublishJobs, toPublicationDTO, type PublicationDTO } from "../marketplaces/publications";
import { listDrafts, toDraftDTO, type ListingDraftDTO } from "../listings/store";
import { sortComps, toCompDTO, toEstimateDTO, type CompDTO, type EstimateDTO } from "../pricing/dto";
import { getOwnedItemFull } from "./access";
import { toPhotoDTO, type PhotoDTO } from "./dto";

/**
 * Everything the review page needs for one item, in one client-safe payload. Built by the server
 * component on first render and by GET /api/items/[id]/summary on refresh.
 */

export type ItemSummaryDTO = {
  id: string;
  sku: string;
  title: string;
  status: ItemStatus;
  brand: string | null;
  model: string | null;
  categoryPath: string[];
  conditionGrade: ConditionGrade | null;
  conditionNotes: string | null;
  acquisitionCost: number | null;
  estimatedValue: number | null;
  listPrice: number | null;
  floorPrice: number | null;
  shippingCost: number | null;
  quantity: number;
  pendingOffers: number;
  createdAt: string;
  updatedAt: string;
};

export type ProfileDTO = {
  data: StoredProfile;
  provider: string;
  model: string;
  promptVersion: string;
  demo: boolean;
  updatedAt: string;
};

export type AnalysisJobDTO = { id: string; status: string; error: string | null; createdAt: string };

export type ReviewPrefs = { expertMode: boolean; defaultMarketplaces: Marketplace[]; pricingStrategy: PricingStrategy };

export type ItemSummary = {
  item: ItemSummaryDTO;
  photos: PhotoDTO[];
  profile: ProfileDTO | null;
  estimate: EstimateDTO | null;
  comps: CompDTO[];
  drafts: ListingDraftDTO[];
  publications: PublicationDTO[];
  capabilities: Capabilities;
  prefs: ReviewPrefs;
  analysis: AnalysisJobDTO | null;
  /** True when any AI-derived data on this item came from the demo providers. */
  demo: boolean;
};

type FullItem = Awaited<ReturnType<typeof getOwnedItemFull>>;

export function toItemSummaryDTO(i: FullItem): ItemSummaryDTO {
  return {
    id: i.id,
    sku: i.sku,
    title: i.title,
    status: i.status,
    brand: i.brand,
    model: i.model,
    categoryPath: i.categoryPath,
    conditionGrade: i.conditionGrade,
    conditionNotes: i.conditionNotes,
    acquisitionCost: i.acquisitionCost,
    estimatedValue: i.estimatedValue,
    listPrice: i.listPrice,
    floorPrice: i.floorPrice,
    shippingCost: i.shippingCost,
    quantity: i.quantity,
    pendingOffers: i.offers.length,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  };
}

export function toProfileDTO(p: NonNullable<FullItem["profile"]>): ProfileDTO | null {
  const data = parseStoredProfile(p.data);
  if (!data) return null;
  return { data, provider: p.provider, model: p.model, promptVersion: p.promptVersion, demo: p.provider === "demo", updatedAt: p.updatedAt.toISOString() };
}

export async function buildItemSummary(userId: string, itemId: string): Promise<ItemSummary> {
  const item = await getOwnedItemFull(userId, itemId);
  const [prefs, job, publishJobs, drafts] = await Promise.all([
    db.userPreferences.findUnique({ where: { userId }, select: { expertMode: true, defaultMarketplaces: true, pricingStrategy: true } }),
    db.job.findFirst({ where: { itemId: item.id, type: "ANALYZE_ITEM" }, orderBy: { createdAt: "desc" }, select: { id: true, status: true, error: true, createdAt: true } }),
    latestPublishJobs(item.id),
    listDrafts(item.id),
  ]);
  const caps = publicCapabilities();
  const profile = item.profile ? toProfileDTO(item.profile) : null;
  const estimate = item.estimate ? toEstimateDTO(item.estimate) : null;
  const draftDTOs = drafts.map(toDraftDTO);
  const demo = caps.demoMode || !caps.ai || (profile?.demo ?? false) || (estimate?.demo ?? false) || draftDTOs.some((d) => d.generatedBy.includes("demo"));
  return {
    item: toItemSummaryDTO(item),
    photos: item.photos.map((p) => toPhotoDTO(p)),
    profile,
    estimate,
    comps: sortComps(item.comps).map(toCompDTO),
    drafts: draftDTOs,
    publications: item.publications.map((p) => toPublicationDTO(p, publishJobs.get(p.id) ?? null)),
    capabilities: caps,
    prefs: {
      expertMode: prefs?.expertMode ?? false,
      defaultMarketplaces: (prefs?.defaultMarketplaces ?? ["EBAY", "FACEBOOK", "OFFERUP", "NEXTDOOR"]) as Marketplace[],
      pricingStrategy: prefs?.pricingStrategy ?? "BALANCED",
    },
    analysis: job ? { id: job.id, status: job.status, error: job.error, createdAt: job.createdAt.toISOString() } : null,
    demo,
  };
}
