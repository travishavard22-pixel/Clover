import { describe, expect, it, beforeAll } from "vitest";

beforeAll(() => {
  process.env.BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET || "unit-test-secret-0123456789abcdef";
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://x:y@localhost:5432/z";
  process.env.CLOVER_ENCRYPTION_KEYS = process.env.CLOVER_ENCRYPTION_KEYS || `v1:${Buffer.alloc(32, 7).toString("base64")}`;
});

describe("signed file urls", async () => {
  const { signedFileUrl, verifySignedFile, assertSafeKey, photoKey } = await import("@/lib/storage");

  it("signs and verifies", () => {
    const url = new URL(signedFileUrl("users/u1/items/i1/p1-web.jpg", 60));
    const exp = url.searchParams.get("exp");
    const sig = url.searchParams.get("sig");
    expect(url.pathname).toBe("/api/files/users/u1/items/i1/p1-web.jpg");
    expect(verifySignedFile("users/u1/items/i1/p1-web.jpg", exp, sig)).toBe(true);
    expect(verifySignedFile("users/u1/items/i1/p2-web.jpg", exp, sig)).toBe(false);
    expect(verifySignedFile("users/u1/items/i1/p1-web.jpg", "1", sig)).toBe(false);
    expect(verifySignedFile("users/u1/items/i1/p1-web.jpg", exp, "nope")).toBe(false);
  });

  it("rejects unsafe keys", () => {
    expect(() => assertSafeKey("../etc/passwd")).toThrow();
    expect(() => assertSafeKey("/abs")).toThrow();
    expect(() => assertSafeKey("ok/path-1.jpg")).not.toThrow();
    expect(photoKey("u", "i", "p", "thumb")).toBe("users/u/items/i/p-thumb.jpg");
  });
});
