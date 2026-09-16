import { describe, expect, it } from "vitest";
import { validateListingUrl } from "@/lib/marketplaces/urls";

describe("validateListingUrl", () => {
  it("accepts a listing on the marketplace's own domain and normalises it", () => {
    const r = validateListingUrl("FACEBOOK", "http://www.facebook.com/marketplace/item/123456789/#tracking");
    expect(r).toEqual({ ok: true, url: "https://www.facebook.com/marketplace/item/123456789/" });
  });

  it("adds https when the scheme is missing", () => {
    const r = validateListingUrl("OFFERUP", "offerup.com/item/detail/abc123");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.url).toBe("https://offerup.com/item/detail/abc123");
  });

  it("rejects links on other hosts, including look-alikes", () => {
    expect(validateListingUrl("EBAY", "https://www.ebay.com.evil.example/itm/1")).toMatchObject({ ok: false });
    expect(validateListingUrl("EBAY", "https://notebay.com/itm/1")).toMatchObject({ ok: false });
    expect(validateListingUrl("MERCARI", "https://www.facebook.com/marketplace/item/1")).toMatchObject({ ok: false, reason: expect.stringContaining("mercari.com") });
  });

  it("rejects empty input, non-URLs, non-http schemes and the bare home page", () => {
    expect(validateListingUrl("CRAIGSLIST", "   ")).toMatchObject({ ok: false });
    expect(validateListingUrl("CRAIGSLIST", "not a url at all !!")).toMatchObject({ ok: false });
    expect(validateListingUrl("CRAIGSLIST", "javascript:alert(1)")).toMatchObject({ ok: false });
    expect(validateListingUrl("POSHMARK", "https://poshmark.com/")).toMatchObject({ ok: false, reason: expect.stringContaining("home page") });
  });

  it("accepts regional eBay and Nextdoor domains", () => {
    expect(validateListingUrl("EBAY", "https://www.ebay.co.uk/itm/123").ok).toBe(true);
    expect(validateListingUrl("NEXTDOOR", "https://nextdoor.co.uk/for_sale_and_free/abc").ok).toBe(true);
  });
});
