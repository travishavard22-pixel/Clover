import type { Marketplace } from "../db";
import { capabilities } from "../env";
import { MARKETPLACES } from "./registry";

export type ConnectionMode = "api" | "assisted" | "demo";

/** Which implementation serves a marketplace right now, given the configured credentials. */
export function marketplaceMode(marketplace: Marketplace): ConnectionMode {
  if (marketplace === "EBAY") return capabilities.ebay ? "api" : "demo";
  if (marketplace === "NEXTDOOR") return capabilities.nextdoorApi ? "api" : "assisted";
  return "assisted";
}

/** Plain-language explanation of the mode. Never hides a limitation. */
export function modeExplanation(marketplace: Marketplace, mode: ConnectionMode): string {
  const info = MARKETPLACES[marketplace];
  if (mode === "demo") {
    return "eBay credentials are not configured on this deployment, so Clover runs a simulated eBay: the consent screen, listing ids, fee preview and buyer offers are generated locally. Nothing is sent to eBay.";
  }
  if (marketplace === "NEXTDOOR" && mode === "assisted") {
    return `${info.modeExplanation} Publish API access pending — assisted mode active.`;
  }
  return info.modeExplanation;
}

export const MODE_LABELS: Record<ConnectionMode, string> = { api: "API", assisted: "Assisted", demo: "Demo" };
