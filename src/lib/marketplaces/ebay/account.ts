import type { MarketplaceConnection } from "../../db";
import { env } from "../../env";
import { ebayUserFetch } from "./client";
import { EbayApiError } from "./errors";

const MP = () => env.EBAY_MARKETPLACE_ID;

export type EbayPolicies = { fulfillmentPolicyId: string; paymentPolicyId: string; returnPolicyId: string };

export async function getOptedInPrograms(c: MarketplaceConnection): Promise<string[]> {
  const data = await ebayUserFetch<{ programs?: Array<{ programType: string }> }>(c, { path: "/sell/account/v1/program/get_opted_in_programs" });
  return (data.programs ?? []).map((p) => p.programType);
}

/** Business policies are mandatory for the Inventory API; opt the seller in (idempotent). */
export async function optInToProgram(c: MarketplaceConnection, programType = "SELLING_POLICY_MANAGEMENT"): Promise<void> {
  try {
    await ebayUserFetch(c, { method: "POST", path: "/sell/account/v1/program/opt_in", body: { programType } });
  } catch (e) {
    // 20403 "already opted in" is fine.
    if (e instanceof EbayApiError && e.errors.some((x) => /already/i.test(x.message ?? ""))) return;
    throw e;
  }
}

type PolicyList<K extends string> = { [P in K]: Array<{ name: string; marketplaceId: string } & Record<string, unknown>> } & { total?: number };

async function firstPolicyId(c: MarketplaceConnection, path: string, key: string, idKey: string): Promise<string | null> {
  const data = await ebayUserFetch<PolicyList<string>>(c, { path, query: { marketplace_id: MP() } });
  const list = (data[key] ?? []) as Array<Record<string, unknown>>;
  const preferred = list.find((p) => p.name === "Clover default") ?? list[0];
  return preferred ? String(preferred[idKey]) : null;
}

export async function getOrCreateDefaultPolicies(c: MarketplaceConnection, prefs: { offersShipping: boolean; offersLocalPickup: boolean }): Promise<EbayPolicies> {
  let fulfillmentPolicyId = await firstPolicyId(c, "/sell/account/v1/fulfillment_policy", "fulfillmentPolicies", "fulfillmentPolicyId");
  if (!fulfillmentPolicyId) {
    const shippingOptions = prefs.offersShipping
      ? [{ optionType: "DOMESTIC", costType: "FLAT_RATE", shippingServices: [{ shippingCarrierCode: "USPS", shippingServiceCode: "USPSGroundAdvantage", shippingCost: { currency: "USD", value: "0.00" }, freeShipping: true, sortOrder: 1 }] }]
      : [];
    const res = await ebayUserFetch<{ fulfillmentPolicyId: string }>(c, {
      method: "POST",
      path: "/sell/account/v1/fulfillment_policy",
      body: { name: "Clover default", marketplaceId: MP(), categoryTypes: [{ name: "ALL_EXCLUDING_MOTORS_VEHICLES" }], handlingTime: { unit: "DAY", value: 2 }, localPickup: prefs.offersLocalPickup, shippingOptions },
    });
    fulfillmentPolicyId = res.fulfillmentPolicyId;
  }
  let paymentPolicyId = await firstPolicyId(c, "/sell/account/v1/payment_policy", "paymentPolicies", "paymentPolicyId");
  if (!paymentPolicyId) {
    const res = await ebayUserFetch<{ paymentPolicyId: string }>(c, {
      method: "POST",
      path: "/sell/account/v1/payment_policy",
      body: { name: "Clover default", marketplaceId: MP(), categoryTypes: [{ name: "ALL_EXCLUDING_MOTORS_VEHICLES" }], immediatePay: true },
    });
    paymentPolicyId = res.paymentPolicyId;
  }
  let returnPolicyId = await firstPolicyId(c, "/sell/account/v1/return_policy", "returnPolicies", "returnPolicyId");
  if (!returnPolicyId) {
    const res = await ebayUserFetch<{ returnPolicyId: string }>(c, {
      method: "POST",
      path: "/sell/account/v1/return_policy",
      body: { name: "Clover default", marketplaceId: MP(), categoryTypes: [{ name: "ALL_EXCLUDING_MOTORS_VEHICLES" }], returnsAccepted: true, returnPeriod: { unit: "DAY", value: 30 }, returnShippingCostPayer: "BUYER", refundMethod: "MONEY_BACK" },
    });
    returnPolicyId = res.returnPolicyId;
  }
  return { fulfillmentPolicyId, paymentPolicyId, returnPolicyId };
}

export const CLOVER_LOCATION_KEY = "clover-default";

/** POST /sell/inventory/v1/location/{key} — an inventory location must exist before publishing. Idempotent (409 = already exists). */
export async function createInventoryLocation(c: MarketplaceConnection, address: { city: string | null; region: string | null; postalCode: string | null; country: string }): Promise<string> {
  const key = CLOVER_LOCATION_KEY;
  const location: Record<string, unknown> = { address: { country: address.country, ...(address.city ? { city: address.city } : {}), ...(address.region ? { stateOrProvince: address.region } : {}), ...(address.postalCode ? { postalCode: address.postalCode } : {}) } };
  try {
    await ebayUserFetch(c, { method: "POST", path: `/sell/inventory/v1/location/${key}`, body: { location, locationTypes: ["WAREHOUSE"], name: "Clover default location", merchantLocationStatus: "ENABLED" } });
  } catch (e) {
    if (e instanceof EbayApiError && (e.status === 409 || e.errors.some((x) => x.errorId === 25803))) return key;
    throw e;
  }
  return key;
}
