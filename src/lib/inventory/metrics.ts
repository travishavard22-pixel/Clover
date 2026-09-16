import { db } from "../db";
import { computeMetrics, type InventoryMetrics } from "./compute";

export type DashboardMetrics = InventoryMetrics & {
  pendingOffers: number;
  needsAttention: number;
  failedConnections: number;
  openRecommendations: number;
  totalItems: number;
};

/** Everything the dashboard and insights pages need, in one pass over the user's inventory. */
export async function getMetrics(userId: string, now = new Date()): Promise<DashboardMetrics> {
  const [items, publications, offerItems, pendingOffers, needsAttention, failedConnections, openRecommendations] = await Promise.all([
    db.item.findMany({
      where: { userId },
      select: {
        id: true,
        status: true,
        createdAt: true,
        listedAt: true,
        soldAt: true,
        soldPrice: true,
        soldMarketplace: true,
        fees: true,
        shippingCost: true,
        acquisitionCost: true,
        estimatedValue: true,
        listPrice: true,
      },
    }),
    db.publication.findMany({ where: { userId }, select: { itemId: true, marketplace: true, status: true } }),
    db.offer.findMany({ where: { userId }, select: { itemId: true }, distinct: ["itemId"] }),
    db.offer.count({ where: { userId, status: "PENDING", item: { status: { notIn: ["SOLD", "SHIPPED", "COMPLETED", "ARCHIVED"] } } } }),
    db.publication.count({ where: { userId, status: { in: ["NEEDS_ATTENTION", "REQUIRES_USER_ACTION", "FAILED"] } } }),
    db.marketplaceConnection.count({ where: { userId, status: { in: ["ERROR", "NEEDS_REAUTH"] } } }),
    db.recommendation.count({ where: { userId, status: "OPEN", OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }] } }),
  ]);
  const base = computeMetrics(items, publications, { now, itemsWithOffers: new Set(offerItems.map((o) => o.itemId)) });
  return { ...base, pendingOffers, needsAttention, failedConnections, openRecommendations, totalItems: items.length };
}

/** Sold price vs the estimate it was priced from — the "price realisation" chart. */
export async function getPriceRealisation(userId: string) {
  const rows = await db.item.findMany({
    where: { userId, status: { in: ["SOLD", "SHIPPED", "COMPLETED"] }, soldPrice: { not: null }, estimate: { isNot: null } },
    select: { id: true, title: true, soldPrice: true, soldMarketplace: true, estimate: { select: { recommended: true, basis: true } } },
    orderBy: { soldAt: "desc" },
    take: 200,
  });
  return rows
    .filter((r) => r.estimate && r.soldPrice !== null)
    .map((r) => ({ id: r.id, title: r.title, soldPrice: r.soldPrice!, estimate: r.estimate!.recommended, basis: r.estimate!.basis, marketplace: r.soldMarketplace }));
}
