import type { PublishResult } from "../types";

export type EbayErrorDetail = {
  errorId?: number;
  domain?: string;
  category?: string;
  message?: string;
  longMessage?: string;
  parameters?: Array<{ name?: string; value?: string }>;
};

/** A non-2xx response from any eBay API (REST or Trading). */
export class EbayApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public errors: EbayErrorDetail[] = [],
    public retryable = status >= 500 || status === 429,
  ) {
    super(message);
    this.name = "EbayApiError";
  }
  get primary(): EbayErrorDetail | undefined {
    return this.errors[0];
  }
}

/** Thrown when the refresh token has been revoked or expired: the user must consent again. */
export class EbayReauthError extends Error {
  constructor(message = "eBay authorization expired. Reconnect eBay to continue.") {
    super(message);
    this.name = "EbayReauthError";
  }
}

export type Attention = Extract<PublishResult, { status: "NEEDS_ATTENTION" }>["attention"];

const quote = (s: string | undefined) => (s ? `'${s}'` : "this field");

/**
 * Map an eBay error into a human recovery step. Field names refer to the listing editor
 * (`title`, `description`, `price`, `condition`, `category`, `specifics`, `photos`, `shipping`).
 */
export function mapEbayError(err: unknown): PublishResult {
  if (err instanceof EbayReauthError) {
    return { status: "NEEDS_ATTENTION", attention: { code: "reauth", message: "eBay authorization has expired.", recovery: "Reconnect eBay from Connections, then publish again." } };
  }
  if (!(err instanceof EbayApiError)) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: "FAILED", error: message, retryable: false };
  }
  if (err.status === 401) {
    return { status: "NEEDS_ATTENTION", attention: { code: "reauth", message: "eBay rejected Clover's access token.", recovery: "Reconnect eBay from Connections, then publish again." } };
  }
  const e = err.primary;
  const text = `${e?.message ?? ""} ${e?.longMessage ?? ""}`.trim();
  const id = e?.errorId;
  const attention = (a: Attention): PublishResult => ({ status: "NEEDS_ATTENTION", attention: a });

  // Aspect / item specific problems (Inventory 25002/25604/25709 and free-text variants).
  const aspectMatch = text.match(/(?:aspect|item specific)\s*['"]?([A-Za-z0-9 \-\/&()]+?)['"]?\s*(?:is|are)?\s*(?:required|missing|mandatory)/i) ?? text.match(/required\s+(?:aspect|item specific)\s*['"]?([A-Za-z0-9 \-\/&()]+)['"]?/i);
  if (aspectMatch) {
    const name = aspectMatch[1]!.trim();
    return attention({ code: "aspect_required", message: `eBay requires ${quote(name)} for this category.`, recovery: `Add ${quote(name)} to the item specifics in the listing, then publish again.`, field: "specifics" });
  }
  if (/invalid value for (?:the )?aspect\s*['"]?([^'"]+)/i.test(text)) {
    const name = text.match(/aspect\s*['"]?([^'".]+)/i)?.[1]?.trim();
    return attention({ code: "aspect_invalid", message: `eBay does not accept the value given for ${quote(name)}.`, recovery: `Pick one of eBay's allowed values for ${quote(name)} in the listing.`, field: "specifics" });
  }
  if (id === 25401 || /invalid category|category .* (?:is not a leaf|not valid)/i.test(text)) {
    return attention({ code: "category_invalid", message: "eBay did not accept the category.", recovery: "Choose a more specific (leaf) category in the listing.", field: "category" });
  }
  if (id === 25709 || /business polic|fulfillmentPolicyId|paymentPolicyId|returnPolicyId|policy .* (?:invalid|not found)/i.test(text)) {
    return attention({ code: "policies_missing", message: "eBay needs shipping, payment and return policies for this listing.", recovery: "Reconnect eBay from Connections so Clover can create default policies, or set them in Seller Hub." });
  }
  if (/condition/i.test(text) && /(invalid|not (?:valid|allowed|supported)|required)/i.test(text)) {
    return attention({ code: "condition_invalid", message: "eBay does not allow this condition in the chosen category.", recovery: "Change the condition grade or the category in the listing.", field: "condition" });
  }
  if (/title/i.test(text) && /(too long|exceed|invalid|required)/i.test(text)) {
    return attention({ code: "title_invalid", message: "eBay rejected the title.", recovery: "Shorten the title to 80 characters and remove special characters.", field: "title" });
  }
  if (/(image|picture|photo)/i.test(text)) {
    return attention({ code: "photos_invalid", message: "eBay could not use one of the photos.", recovery: "Re-upload the photo (JPG or PNG under 12 MB) and publish again.", field: "photos" });
  }
  if (/price/i.test(text) && /(invalid|required|minimum|maximum)/i.test(text)) {
    return attention({ code: "price_invalid", message: "eBay rejected the price.", recovery: "Set a price of at least $0.99 in the listing.", field: "price" });
  }
  if (/(merchantLocationKey|inventory location|location)/i.test(text) && /(invalid|not found|required)/i.test(text)) {
    return attention({ code: "location_missing", message: "eBay needs an item location before publishing.", recovery: "Add your city and postal code in Settings, then reconnect eBay." });
  }
  if (/(description)/i.test(text) && /(too long|exceed|invalid|required)/i.test(text)) {
    return attention({ code: "description_invalid", message: "eBay rejected the description.", recovery: "Shorten the description or remove unsupported HTML.", field: "description" });
  }
  if (/selling limit|listing limit|exceeded .* limit/i.test(text)) {
    return attention({ code: "selling_limit", message: "Your eBay account has reached its selling limit.", recovery: "Request a higher selling limit in eBay Seller Hub, then publish again." });
  }
  if (err.retryable) return { status: "FAILED", error: `eBay is temporarily unavailable (${err.status}). ${text}`.trim(), retryable: true };
  return attention({ code: `ebay_${id ?? err.status}`, message: text || `eBay returned an error (${err.status}).`, recovery: "Review the listing and try again. If it keeps failing, publish this item on eBay manually and paste the listing link." });
}
