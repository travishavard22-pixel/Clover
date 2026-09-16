import { describe, expect, it } from "vitest";
import { buildOrderBy, buildWhere, clampLimit, decodeCursorId, encodeCursor, filtersFromSearchParams, filtersToSearchParams, parseMarketplace, parseSort, parseStatuses } from "@/lib/inventory/filters";

describe("buildWhere", () => {
  it("hides archived items by default", () => {
    expect(buildWhere("u1", {})).toEqual({ AND: [{ userId: "u1" }, { status: { not: "ARCHIVED" } }] });
  });
  it("includes archived when asked or when the status filter names it", () => {
    expect(buildWhere("u1", { includeArchived: true })).toEqual({ userId: "u1" });
    expect(buildWhere("u1", { status: ["ARCHIVED"] })).toEqual({ AND: [{ userId: "u1" }, { status: { in: ["ARCHIVED"] } }] });
  });
  it("ANDs each search term across the text fields", () => {
    const w = buildWhere("u1", { q: "  canon   ae-1 ", status: ["LISTED", "READY"] });
    const and = (w as { AND: unknown[] }).AND;
    expect(and).toHaveLength(4);
    expect(and[1]).toEqual({ status: { in: ["LISTED", "READY"] } });
    const term = and[2] as { OR: Array<Record<string, unknown>> };
    expect(term.OR).toHaveLength(5);
    expect(term.OR[0]).toEqual({ title: { contains: "canon", mode: "insensitive" } });
    expect((and[3] as { OR: Array<Record<string, unknown>> }).OR[3]).toEqual({ sku: { contains: "ae-1", mode: "insensitive" } });
  });
  it("caps the number of search terms", () => {
    const w = buildWhere("u1", { q: "a b c d e f g h" }) as { AND: unknown[] };
    expect(w.AND).toHaveLength(2 + 6);
  });
  it("filters by marketplace through publications or the sold marketplace", () => {
    const w = buildWhere("u1", { marketplace: "EBAY" }) as { AND: unknown[] };
    expect(w.AND[2]).toEqual({ OR: [{ publications: { some: { marketplace: "EBAY" } } }, { soldMarketplace: "EBAY" }] });
  });
});

describe("buildOrderBy", () => {
  it("always tie-breaks on id", () => {
    expect(buildOrderBy("newest")).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    expect(buildOrderBy("oldest")).toEqual([{ createdAt: "asc" }, { id: "asc" }]);
    expect(buildOrderBy("price_desc")).toEqual([{ listPrice: { sort: "desc", nulls: "last" } }, { id: "desc" }]);
    expect(buildOrderBy("price_asc")).toEqual([{ listPrice: { sort: "asc", nulls: "last" } }, { id: "asc" }]);
    expect(buildOrderBy("days_on_market")).toEqual([{ listedAt: { sort: "asc", nulls: "last" } }, { id: "asc" }]);
    expect(buildOrderBy("estimated_value")).toEqual([{ estimatedValue: { sort: "desc", nulls: "last" } }, { id: "desc" }]);
    expect(buildOrderBy()).toEqual(buildOrderBy("newest"));
  });
});

describe("parsing", () => {
  it("clamps limits", () => {
    expect(clampLimit(undefined)).toBe(24);
    expect(clampLimit(0)).toBe(24);
    expect(clampLimit(1000)).toBe(100);
    expect(clampLimit(7.9)).toBe(7);
  });
  it("parses status lists from repeated and comma-separated params, ignoring junk", () => {
    expect(parseStatuses(["listed,ready", "SOLD", "bogus", "listed"])).toEqual(["LISTED", "READY", "SOLD"]);
    expect(parseStatuses(undefined)).toEqual([]);
  });
  it("parses marketplace and sort with safe defaults", () => {
    expect(parseMarketplace("ebay")).toBe("EBAY");
    expect(parseMarketplace("amazon")).toBeUndefined();
    expect(parseSort("price_asc")).toBe("price_asc");
    expect(parseSort("nope")).toBe("newest");
  });
  it("round-trips cursors and rejects tampered ones", () => {
    const c = encodeCursor("clx123_abc");
    expect(decodeCursorId(c)).toBe("clx123_abc");
    expect(decodeCursorId(Buffer.from("a b").toString("base64url"))).toBeNull();
    expect(decodeCursorId(Buffer.from("x".repeat(65)).toString("base64url"))).toBeNull();
    expect(decodeCursorId("")).toBeNull();
  });
  it("round-trips filters through search params", () => {
    const f = { q: "lamp", status: ["LISTED", "READY"] as const, marketplace: "FACEBOOK" as const, sort: "price_desc" as const, cursor: null, limit: 12, includeArchived: true };
    const sp = filtersToSearchParams({ ...f, status: [...f.status] });
    expect(sp.getAll("status")).toEqual(["LISTED", "READY"]);
    const back = filtersFromSearchParams(sp);
    expect(back).toEqual({ q: "lamp", status: ["LISTED", "READY"], marketplace: "FACEBOOK", sort: "price_desc", cursor: null, limit: 12, includeArchived: true });
    expect(filtersToSearchParams({ sort: "newest" }).toString()).toBe("");
  });
});
