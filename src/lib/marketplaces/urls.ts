import type { Marketplace } from "../db";

/**
 * Hostname patterns a pasted listing URL must match before we record it as the external URL of an
 * assisted publication. We never fetch these URLs; they are stored as plain links for the seller.
 */
const HOST_PATTERNS: Record<Marketplace, RegExp[]> = {
  EBAY: [/(^|\.)ebay\.(com|co\.uk|ca|com\.au|de|fr|it|es)$/i],
  FACEBOOK: [/(^|\.)facebook\.com$/i, /(^|\.)fb\.com$/i, /^m\.facebook\.com$/i],
  OFFERUP: [/(^|\.)offerup\.com$/i, /(^|\.)offerup\.co$/i],
  NEXTDOOR: [/(^|\.)nextdoor\.com$/i, /(^|\.)nextdoor\.co\.uk$/i, /(^|\.)nextdoor\.(ca|com\.au)$/i],
  CRAIGSLIST: [/(^|\.)craigslist\.org$/i],
  MERCARI: [/(^|\.)mercari\.com$/i],
  POSHMARK: [/(^|\.)poshmark\.com$/i, /(^|\.)posh\.mk$/i],
};

export type ListingUrlCheck = { ok: true; url: string } | { ok: false; reason: string };

/** Validates a listing URL the user pasted for `marketplace`. Normalises to https and strips tracking hashes. */
export function validateListingUrl(marketplace: Marketplace, input: string): ListingUrlCheck {
  const raw = input.trim();
  if (!raw) return { ok: false, reason: "Paste the link to your listing." };
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { ok: false, reason: "That doesn't look like a web address." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, reason: "Only http(s) links are accepted." };
  const host = url.hostname.toLowerCase();
  const patterns = HOST_PATTERNS[marketplace];
  if (!patterns.some((p) => p.test(host))) {
    return { ok: false, reason: `This link isn't on ${marketplaceDomainHint(marketplace)}. Paste the listing's own URL.` };
  }
  url.protocol = "https:";
  url.hash = "";
  if (url.pathname === "/" && !url.search) return { ok: false, reason: "That's the marketplace home page, not a listing." };
  return { ok: true, url: url.toString() };
}

export function marketplaceDomainHint(marketplace: Marketplace): string {
  const hints: Record<Marketplace, string> = {
    EBAY: "ebay.com",
    FACEBOOK: "facebook.com",
    OFFERUP: "offerup.com",
    NEXTDOOR: "nextdoor.com",
    CRAIGSLIST: "craigslist.org",
    MERCARI: "mercari.com",
    POSHMARK: "poshmark.com",
  };
  return hints[marketplace];
}
