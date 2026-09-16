import type { MarketplaceConnection } from "../../db";
import { env } from "../../env";
import { getUserAccessToken } from "./client";
import { ebayHosts } from "./config";
import { EbayApiError } from "./errors";
import type { SyncedOffer } from "../types";

/**
 * eBay Trading API calls for buyer Best Offers (no REST equivalent). XML is built and parsed
 * here without any dependency: the payloads are small, flat and well defined.
 */
export const TRADING_COMPAT_LEVEL = "1349";
const SITE_ID = "0"; // US

export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

/** First text content of `<tag>` within `xml` (no attributes, no namespaces). */
export function xmlText(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
  return m ? unescapeXml(m[1]!.trim()) : null;
}

/** Every `<tag>…</tag>` block (outer content) in order. */
export function xmlBlocks(xml: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1]!);
  return out;
}

export function buildGetBestOffersXml(itemId: string, status: "Active" | "All" = "Active"): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<GetBestOffersRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <ItemID>${escapeXml(itemId)}</ItemID>
  <BestOfferStatus>${status}</BestOfferStatus>
  <DetailLevel>ReturnAll</DetailLevel>
</GetBestOffersRequest>`;
}

export type RespondAction = "Accept" | "Counter" | "Decline";

export function buildRespondToBestOfferXml(input: { itemId: string; bestOfferId: string; action: RespondAction; counterCents?: number; message?: string }): string {
  const counter = input.action === "Counter" && input.counterCents ? `\n  <CounterOfferPrice currencyID="USD">${(input.counterCents / 100).toFixed(2)}</CounterOfferPrice>\n  <CounterOfferQuantity>1</CounterOfferQuantity>` : "";
  const msg = input.message ? `\n  <SellerResponse>${escapeXml(input.message.slice(0, 250))}</SellerResponse>` : "";
  return `<?xml version="1.0" encoding="utf-8"?>
<RespondToBestOfferRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <ItemID>${escapeXml(input.itemId)}</ItemID>
  <BestOfferID>${escapeXml(input.bestOfferId)}</BestOfferID>
  <Action>${input.action}</Action>${counter}${msg}
</RespondToBestOfferRequest>`;
}

const STATUS_MAP: Record<string, SyncedOffer["status"]> = {
  Active: "PENDING",
  Pending: "PENDING",
  Accepted: "ACCEPTED",
  Declined: "DECLINED",
  Countered: "COUNTERED",
  Expired: "EXPIRED",
  Retracted: "EXPIRED",
  AdminEnded: "EXPIRED",
  PendingBuyerConfirmation: "PENDING",
  PendingBuyerPayment: "ACCEPTED",
};

/** Parse a GetBestOffers response into our neutral offer shape. Only buyer-initiated offers (not our counters) are returned. */
export function parseBestOffers(xml: string): SyncedOffer[] {
  const ack = xmlText(xml, "Ack");
  if (ack && ack !== "Success" && ack !== "Warning") {
    const msg = xmlText(xml, "LongMessage") ?? xmlText(xml, "ShortMessage") ?? "Trading API error";
    throw new EbayApiError(msg, 400, [{ errorId: Number(xmlText(xml, "ErrorCode") ?? 0), message: msg }], false);
  }
  const out: SyncedOffer[] = [];
  for (const block of xmlBlocks(xml, "BestOffer")) {
    const id = xmlText(block, "BestOfferID");
    if (!id) continue;
    const codeType = xmlText(block, "BestOfferCodeType") ?? "BuyerBestOffer";
    if (codeType === "SellerCounterOffer") continue;
    const buyerBlock = xmlBlocks(block, "Buyer")[0] ?? "";
    const price = Number(xmlText(block, "Price") ?? "0");
    const expiration = xmlText(block, "ExpirationTime");
    out.push({
      externalId: id,
      buyerName: xmlText(buyerBlock, "UserID") ?? "eBay buyer",
      buyerId: xmlText(buyerBlock, "UserID"),
      amountCents: Math.round(price * 100),
      message: xmlText(block, "BuyerMessage"),
      receivedAt: expiration ? new Date(new Date(expiration).getTime() - 48 * 3600 * 1000) : new Date(),
      expiresAt: expiration ? new Date(expiration) : null,
      status: STATUS_MAP[xmlText(block, "Status") ?? "Active"] ?? "PENDING",
    });
  }
  return out;
}

export function assertTradingSuccess(xml: string): void {
  const ack = xmlText(xml, "Ack");
  if (ack === "Success" || ack === "Warning") return;
  const msg = xmlText(xml, "LongMessage") ?? xmlText(xml, "ShortMessage") ?? "Trading API error";
  throw new EbayApiError(msg, 400, [{ errorId: Number(xmlText(xml, "ErrorCode") ?? 0), message: msg }], false);
}

async function tradingCall(c: MarketplaceConnection, callName: string, xml: string): Promise<string> {
  const token = await getUserAccessToken(c);
  let last: EbayApiError | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${ebayHosts().api}/ws/api.dll`, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml",
        "X-EBAY-API-IAF-TOKEN": token,
        "X-EBAY-API-COMPATIBILITY-LEVEL": TRADING_COMPAT_LEVEL,
        "X-EBAY-API-CALL-NAME": callName,
        "X-EBAY-API-SITEID": SITE_ID,
        ...(env.EBAY_CLIENT_ID ? { "X-EBAY-API-APP-NAME": env.EBAY_CLIENT_ID } : {}),
      },
      body: xml,
    });
    const text = await res.text();
    if (res.ok) return text;
    last = new EbayApiError(`Trading ${callName} failed (${res.status})`, res.status, [{ message: text.slice(0, 300) }]);
    if (!last.retryable || attempt === 2) throw last;
    await new Promise((r) => setTimeout(r, [600, 1800][attempt]));
  }
  throw last ?? new EbayApiError("Trading call failed", 500);
}

export async function getBestOffers(c: MarketplaceConnection, itemId: string, status: "Active" | "All" = "All"): Promise<SyncedOffer[]> {
  return parseBestOffers(await tradingCall(c, "GetBestOffers", buildGetBestOffersXml(itemId, status)));
}

export async function respondToBestOffer(c: MarketplaceConnection, input: { itemId: string; bestOfferId: string; action: "accept" | "decline" | "counter"; counterCents?: number; message?: string }): Promise<void> {
  const action: RespondAction = input.action === "accept" ? "Accept" : input.action === "counter" ? "Counter" : "Decline";
  assertTradingSuccess(await tradingCall(c, "RespondToBestOffer", buildRespondToBestOfferXml({ ...input, action })));
}
