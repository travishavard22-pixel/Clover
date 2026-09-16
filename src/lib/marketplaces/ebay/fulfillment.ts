import type { MarketplaceConnection } from "../../db";
import { ebayUserFetch } from "./client";
import type { SyncedOrder } from "../types";

type EbayOrder = {
  orderId: string;
  creationDate: string;
  orderFulfillmentStatus?: string;
  orderPaymentStatus?: string;
  buyer?: { username?: string };
  pricingSummary?: { total?: { value: string }; priceSubtotal?: { value: string } };
  totalMarketplaceFee?: { value: string };
  lineItems?: Array<{ legacyItemId?: string; listingMarketplaceId?: string; sku?: string; lineItemCost?: { value: string }; total?: { value: string }; quantity?: number }>;
};

const cents = (v: string | undefined) => (v ? Math.round(Number(v) * 100) : 0);

/** GET /sell/fulfillment/v1/order?filter=creationdate:[since..] — only completed-checkout orders appear. */
export async function getOrders(c: MarketplaceConnection, since: Date): Promise<SyncedOrder[]> {
  const out: SyncedOrder[] = [];
  let offset = 0;
  const limit = 50;
  for (let page = 0; page < 10; page++) {
    const data = await ebayUserFetch<{ orders?: EbayOrder[]; total?: number }>(c, {
      path: "/sell/fulfillment/v1/order",
      query: { filter: `creationdate:[${since.toISOString().replace(/\.\d{3}Z$/, ".000Z")}..]`, limit, offset },
    });
    const orders = data.orders ?? [];
    for (const o of orders) {
      if (o.orderPaymentStatus && !["PAID", "FULLY_REFUNDED", "PARTIALLY_REFUNDED"].includes(o.orderPaymentStatus)) continue;
      for (const li of o.lineItems ?? []) {
        if (!li.legacyItemId) continue;
        out.push({
          externalOrderId: o.orderId,
          externalListingId: li.legacyItemId,
          salePriceCents: cents(li.total?.value ?? li.lineItemCost?.value),
          feesCents: o.totalMarketplaceFee ? cents(o.totalMarketplaceFee.value) : null,
          buyerName: o.buyer?.username ?? null,
          soldAt: new Date(o.creationDate),
        });
      }
    }
    if (orders.length < limit) break;
    offset += limit;
  }
  return out;
}
