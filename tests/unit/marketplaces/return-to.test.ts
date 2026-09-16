import { describe, expect, it } from "vitest";
import { safeReturnTo, withQuery } from "@/lib/marketplaces/return-to";

describe("safeReturnTo", () => {
  it("accepts in-app absolute paths", () => {
    expect(safeReturnTo("/items/abc/publish")).toBe("/items/abc/publish");
    expect(safeReturnTo("/listings?status=live")).toBe("/listings?status=live");
  });

  it("rejects anything that could leave the app", () => {
    expect(safeReturnTo("https://evil.example/")).toBeNull();
    expect(safeReturnTo("//evil.example/")).toBeNull();
    expect(safeReturnTo("/\\evil.example")).toBeNull();
    expect(safeReturnTo("javascript:alert(1)")).toBeNull();
    expect(safeReturnTo("/items/x\nSet-Cookie: a=b")).toBeNull();
    expect(safeReturnTo("/api/marketplaces/ebay/disconnect")).toBeNull();
    expect(safeReturnTo("")).toBeNull();
    expect(safeReturnTo(null)).toBeNull();
  });
});

describe("withQuery", () => {
  it("merges params into a path that may already have a query", () => {
    expect(withQuery("/connections", { connected: "ebay" })).toBe("/connections?connected=ebay");
    expect(withQuery("/connections?returnTo=%2Fx", { error: "denied", marketplace: null })).toBe("/connections?returnTo=%2Fx&error=denied");
    expect(withQuery("/listings", {})).toBe("/listings");
  });
});
