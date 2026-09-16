import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, needsRotation, parseKeyRing, safeEqual, sha256 } from "@/lib/crypto";

const k1 = Buffer.alloc(32, 1).toString("base64");
const k2 = Buffer.alloc(32, 2).toString("base64");

describe("crypto", () => {
  it("round-trips with the primary key and random IVs", () => {
    const ring = parseKeyRing(`v1:${k1}`);
    const a = encryptSecret("refresh-token-abc", ring);
    const b = encryptSecret("refresh-token-abc", ring);
    expect(a).not.toEqual(b);
    expect(a.startsWith("v1.")).toBe(true);
    expect(decryptSecret(a, ring)).toBe("refresh-token-abc");
    expect(decryptSecret(b, ring)).toBe("refresh-token-abc");
  });

  it("decrypts old-key ciphertexts after rotation and flags them", () => {
    const old = parseKeyRing(`v1:${k1}`);
    const rotated = parseKeyRing(`v2:${k2},v1:${k1}`);
    const c = encryptSecret("secret", old);
    expect(decryptSecret(c, rotated)).toBe("secret");
    expect(needsRotation(c, rotated)).toBe(true);
    expect(needsRotation(encryptSecret("x", rotated), rotated)).toBe(false);
  });

  it("rejects tampering and unknown keys", () => {
    const ring = parseKeyRing(`v1:${k1}`);
    const c = encryptSecret("secret", ring);
    const parts = c.split(".");
    const tampered = [parts[0], parts[1], parts[2], Buffer.from("zzzz").toString("base64")].join(".");
    expect(() => decryptSecret(tampered, ring)).toThrow();
    expect(() => decryptSecret(c.replace("v1.", "v9."), ring)).toThrow(/No decryption key/);
    expect(() => parseKeyRing("v1:short")).toThrow(/32 bytes/);
    expect(() => parseKeyRing("")).toThrow();
  });

  it("helpers", () => {
    expect(sha256("a")).toHaveLength(64);
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "ab")).toBe(false);
  });
});
