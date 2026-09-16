import { describe, expect, it } from "vitest";
import { canTransition } from "@/lib/items/status";
import { deleteOrArchive, DOUBLE_SELL_ATTENTION, resolveFees, statusSideEffects, unarchiveTarget } from "@/lib/inventory/rules";

describe("status transitions", () => {
  it("allows the documented lifecycle", () => {
    expect(canTransition("DRAFT", "READY")).toBe(true);
    expect(canTransition("READY", "LISTED")).toBe(true);
    expect(canTransition("LISTED", "OFFER_RECEIVED")).toBe(true);
    expect(canTransition("OFFER_RECEIVED", "SOLD")).toBe(true);
    expect(canTransition("SOLD", "SHIPPED")).toBe(true);
    expect(canTransition("SHIPPED", "COMPLETED")).toBe(true);
    expect(canTransition("COMPLETED", "ARCHIVED")).toBe(true);
  });
  it("blocks nonsense", () => {
    expect(canTransition("DRAFT", "SOLD")).toBe(false);
    expect(canTransition("DRAFT", "SHIPPED")).toBe(false);
    expect(canTransition("SOLD", "DRAFT")).toBe(false);
    expect(canTransition("COMPLETED", "READY")).toBe(false);
  });
  it("is reflexive", () => {
    expect(canTransition("LISTED", "LISTED")).toBe(true);
  });
  it("stamps listedAt when first listed and archivedAt when archived", () => {
    const now = new Date("2026-09-16T00:00:00Z");
    expect(statusSideEffects("READY", "LISTED", now)).toEqual({ listedAt: now });
    expect(statusSideEffects("OFFER_RECEIVED", "LISTED", now)).toEqual({});
    expect(statusSideEffects("LISTED", "ARCHIVED", now)).toEqual({ archivedAt: now });
    expect(statusSideEffects("ARCHIVED", "READY", now)).toEqual({ archivedAt: null });
    expect(statusSideEffects("ARCHIVED", "LISTED", now)).toEqual({ listedAt: now, archivedAt: null });
  });
  it("deletes only drafts and archived items", () => {
    expect(deleteOrArchive("DRAFT")).toBe("delete");
    expect(deleteOrArchive("ARCHIVED")).toBe("delete");
    expect(deleteOrArchive("LISTED")).toBe("archive");
    expect(deleteOrArchive("SOLD")).toBe("archive");
  });
  it("unarchives to READY when priced, otherwise DRAFT", () => {
    expect(unarchiveTarget({ listPrice: 1000, soldAt: null })).toBe("READY");
    expect(unarchiveTarget({ listPrice: null, soldAt: new Date() })).toBe("READY");
    expect(unarchiveTarget({ listPrice: null, soldAt: null })).toBe("DRAFT");
  });
});

describe("mark sold fees", () => {
  it("prefers explicit fees, then the marketplace table, then null", () => {
    expect(resolveFees({ soldPriceCents: 10_000, marketplace: "EBAY", feesCents: 500 })).toBe(500);
    expect(resolveFees({ soldPriceCents: 10_000, marketplace: "EBAY" })).toBe(Math.round(10_000 * 0.136) + 40);
    expect(resolveFees({ soldPriceCents: 10_000, marketplace: "FACEBOOK", local: true })).toBe(0);
    expect(resolveFees({ soldPriceCents: 10_000, marketplace: "NEXTDOOR" })).toBe(0);
    expect(resolveFees({ soldPriceCents: 10_000 })).toBeNull();
  });
  it("describes the double-sell guard in plain words", () => {
    const a = DOUBLE_SELL_ATTENTION("on eBay");
    expect(a.code).toBe("double_sell_guard");
    expect(a.message).toBe("Sold on eBay — end this listing");
    expect(a.recovery).toMatch(/end it/i);
  });
});
