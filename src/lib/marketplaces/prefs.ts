import { db } from "../db";
import type { RenderPrefs } from "./render";

export type SellerLocation = { city: string | null; region: string | null; postalCode: string | null; country: string };

export type SellerPrefs = RenderPrefs & {
  postalCode: string | null;
  country: string;
  defaultMarketplaces: string[];
  notifyOffers: boolean;
  notifyPublishing: boolean;
};

const DEFAULTS: SellerPrefs = {
  city: null,
  region: null,
  postalCode: null,
  country: "US",
  offersLocalPickup: true,
  offersShipping: true,
  defaultShippingNote: null,
  defaultMarketplaces: ["EBAY", "FACEBOOK", "OFFERUP", "NEXTDOOR"],
  notifyOffers: true,
  notifyPublishing: true,
};

/** The seller preferences the marketplace layer needs. Falls back to sensible defaults for brand-new users. */
export async function loadSellerPrefs(userId: string): Promise<SellerPrefs> {
  const p = await db.userPreferences.findUnique({
    where: { userId },
    select: { city: true, region: true, postalCode: true, country: true, offersLocalPickup: true, offersShipping: true, defaultShippingNote: true, defaultMarketplaces: true, notifyOffers: true, notifyPublishing: true },
  });
  if (!p) return DEFAULTS;
  return {
    city: p.city,
    region: p.region,
    postalCode: p.postalCode,
    country: p.country,
    offersLocalPickup: p.offersLocalPickup,
    offersShipping: p.offersShipping,
    defaultShippingNote: p.defaultShippingNote,
    defaultMarketplaces: p.defaultMarketplaces,
    notifyOffers: p.notifyOffers,
    notifyPublishing: p.notifyPublishing,
  };
}

export function locationOf(prefs: SellerPrefs): SellerLocation {
  return { city: prefs.city, region: prefs.region, postalCode: prefs.postalCode, country: prefs.country };
}
