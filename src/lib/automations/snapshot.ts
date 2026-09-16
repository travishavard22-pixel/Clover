import { db } from "../db";
import type { EvaluationContext, SnapshotItem, SnapshotPreferences, SnapshotProfile } from "./types";
import type { AutomationMode, AutomationType } from "../db";

type ProfileData = { itemName?: { value?: unknown } | null; brand?: { value?: unknown } | null; model?: { value?: unknown } | null; dimensions?: { value?: unknown } | null; material?: { value?: unknown } | null };

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

export function profileFromData(data: unknown): SnapshotProfile | null {
  if (!data || typeof data !== "object") return null;
  const d = data as ProfileData;
  return {
    itemName: str(d.itemName?.value),
    brand: str(d.brand?.value),
    model: str(d.model?.value),
    dimensions: str(d.dimensions?.value),
    material: str(d.material?.value),
  };
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** Loads everything the evaluators need for one seller. Archived items are left out. */
export async function loadSnapshotItems(userId: string): Promise<SnapshotItem[]> {
  const rows = await db.item.findMany({
    where: { userId, status: { not: "ARCHIVED" } },
    orderBy: { updatedAt: "desc" },
    include: {
      photos: { select: { id: true, kind: true, width: true, height: true, sortOrder: true, aiGenerated: true, studioMode: true }, orderBy: { sortOrder: "asc" } },
      profile: { select: { data: true } },
      estimate: { select: { quickSale: true, recommended: true, maxValue: true, confidence: true, basis: true } },
      drafts: { select: { id: true, marketplace: true, title: true, updatedAt: true } },
      publications: { select: { id: true, marketplace: true, mode: true, status: true, price: true, externalUrl: true, attention: true, publishedAt: true, updatedAt: true } },
      offers: { select: { id: true, marketplace: true, buyerName: true, amount: true, originalPrice: true, status: true, receivedAt: true, expiresAt: true, message: true }, orderBy: { receivedAt: "desc" } },
    },
  });
  return rows.map((i) => ({
    id: i.id,
    sku: i.sku,
    title: i.title,
    status: i.status,
    brand: i.brand,
    model: i.model,
    categoryPath: i.categoryPath,
    conditionGrade: i.conditionGrade,
    attributes: (i.attributes && typeof i.attributes === "object" && !Array.isArray(i.attributes) ? (i.attributes as Record<string, unknown>) : {}),
    listPrice: i.listPrice,
    floorPrice: i.floorPrice,
    estimatedValue: i.estimatedValue,
    soldPrice: i.soldPrice,
    soldMarketplace: i.soldMarketplace,
    quantity: i.quantity,
    notes: i.notes,
    listedAt: iso(i.listedAt),
    soldAt: iso(i.soldAt),
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
    photos: i.photos,
    profile: profileFromData(i.profile?.data),
    estimate: i.estimate,
    drafts: i.drafts.map((d) => ({ id: d.id, marketplace: d.marketplace, title: d.title, updatedAt: d.updatedAt.toISOString() })),
    publications: i.publications.map((p) => ({
      id: p.id,
      marketplace: p.marketplace,
      mode: p.mode,
      status: p.status,
      price: p.price,
      externalUrl: p.externalUrl,
      attentionCode: p.attention && typeof p.attention === "object" && typeof (p.attention as { code?: unknown }).code === "string" ? (p.attention as { code: string }).code : null,
      publishedAt: iso(p.publishedAt),
      updatedAt: p.updatedAt.toISOString(),
    })),
    offers: i.offers.map((o) => ({ ...o, receivedAt: o.receivedAt.toISOString(), expiresAt: iso(o.expiresAt) })),
  }));
}

export async function loadSnapshotPreferences(userId: string): Promise<SnapshotPreferences> {
  const p = await db.userPreferences.findUnique({ where: { userId } });
  return {
    offersShipping: p?.offersShipping ?? true,
    offersLocalPickup: p?.offersLocalPickup ?? true,
    defaultShippingNote: p?.defaultShippingNote ?? null,
    notifyOffers: p?.notifyOffers ?? true,
    notifyStale: p?.notifyStale ?? true,
    notifyPublishing: p?.notifyPublishing ?? true,
    city: p?.city ?? null,
  };
}

export async function buildEvaluationContext(userId: string, modes: Record<AutomationType, AutomationMode>, now = new Date()): Promise<EvaluationContext> {
  const [items, preferences] = await Promise.all([loadSnapshotItems(userId), loadSnapshotPreferences(userId)]);
  return { now, items, preferences, modes };
}
