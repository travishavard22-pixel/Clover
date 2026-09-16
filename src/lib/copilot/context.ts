import { db, type ItemStatus } from "../db";
import { capabilities } from "../env";
import { computeMetrics, daysOnMarket, STATUS_ORDER } from "../inventory/compute";
import { formatSystemContext, type CopilotContextData } from "./context-format";

/** Loads the seller's snapshot and renders it as the compact system context. */
export async function buildSystemContext(userId: string, now = new Date()): Promise<string> {
  return formatSystemContext(await loadContextData(userId, now), now);
}

export async function loadContextData(userId: string, now = new Date()): Promise<CopilotContextData> {
  const [user, prefs, items, publications, offerItems, pendingOffers, connections, openRecommendations] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { name: true } }),
    db.userPreferences.findUnique({ where: { userId } }),
    db.item.findMany({
      where: { userId },
      select: {
        id: true, title: true, status: true, createdAt: true, listedAt: true, soldAt: true, soldPrice: true, soldMarketplace: true, fees: true, shippingCost: true, acquisitionCost: true, estimatedValue: true, listPrice: true, updatedAt: true,
        estimate: { select: { recommended: true, basis: true, confidence: true } },
        _count: { select: { offers: { where: { status: "PENDING" } } } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    db.publication.findMany({ where: { userId }, select: { itemId: true, marketplace: true, status: true } }),
    db.offer.findMany({ where: { userId }, select: { itemId: true }, distinct: ["itemId"] }),
    db.offer.count({ where: { userId, status: "PENDING", item: { status: { notIn: ["SOLD", "SHIPPED", "COMPLETED", "ARCHIVED"] } } } }),
    db.marketplaceConnection.findMany({ where: { userId }, select: { marketplace: true, status: true, mode: true } }),
    db.recommendation.count({ where: { userId, status: "OPEN" } }),
  ]);
  const metrics = computeMetrics(items, publications, { now, itemsWithOffers: new Set(offerItems.map((o) => o.itemId)) });
  const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<ItemStatus, number>;
  for (const i of items) counts[i.status] += 1;

  const rank = (s: ItemStatus) => (s === "OFFER_RECEIVED" ? 0 : s === "LISTED" ? 1 : s === "READY" ? 2 : s === "SOLD" ? 3 : 4);
  const highlights = [...items]
    .filter((i) => i.status !== "ARCHIVED")
    .sort((a, b) => rank(a.status) - rank(b.status) || b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 12)
    .map((i) => ({ id: i.id, title: i.title, status: i.status, listPrice: i.listPrice, estimate: i.estimate, daysOnMarket: daysOnMarket(i, now), pendingOffers: i._count.offers }));

  return {
    seller: {
      name: user?.name ?? "Seller",
      city: prefs?.city ?? null,
      region: prefs?.region ?? null,
      pricingStrategy: prefs?.pricingStrategy ?? "BALANCED",
      defaultMarketplaces: prefs?.defaultMarketplaces ?? [],
      offersShipping: prefs?.offersShipping ?? true,
      offersLocalPickup: prefs?.offersLocalPickup ?? true,
      expertMode: prefs?.expertMode ?? false,
    },
    counts,
    totals: {
      activeListings: metrics.activeListings,
      sold30d: metrics.sold30d,
      revenue30d: metrics.revenue30d,
      revenueAll: metrics.revenueAll,
      inventoryValueEstimate: metrics.inventoryValueEstimate,
      realisedProfit: metrics.realisedProfit,
      pendingOffers,
      drafts: metrics.drafts,
      ready: metrics.ready,
      stale: metrics.shouldReprice,
    },
    marketplaces: metrics.marketplaces,
    connections,
    highlights,
    openRecommendations,
    demoProviders: capabilities.demoMode || !capabilities.ai,
  };
}
