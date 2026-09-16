import { createSign, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { formatPublicKey, parseSignatureHeader, verifyEbayNotification, verifyNotificationSignature, type EbayPublicKey } from "@/lib/marketplaces/ebay/notification-signature";

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
// eBay hands the PEM back on one line, header and footer glued to the body.
const oneLinePem = publicKey.export({ type: "spki", format: "pem" }).toString().replace(/\n/g, "");
const KEY: EbayPublicKey = { algorithm: "ECDSA", digest: "SHA1", key: oneLinePem };
const body = JSON.stringify({ metadata: { topic: "MARKETPLACE_ACCOUNT_DELETION", schemaVersion: "1.0" }, notification: { notificationId: "n1", eventDate: "2026-09-16T00:00:00Z", data: { username: "seller1", userId: "u1" } } });

function sign(payload: string, digest = "sha1") {
  const signer = createSign(digest);
  signer.update(payload, "utf8");
  return signer.sign(privateKey, "base64");
}
function header(overrides: Record<string, unknown> = {}) {
  return Buffer.from(JSON.stringify({ alg: "ecdsa", kid: "key-1", signature: sign(body), digest: "SHA1", ...overrides })).toString("base64");
}
const getKey = async (kid: string) => {
  if (kid !== "key-1") throw new Error("unknown kid");
  return KEY;
};

describe("eBay notification signature", () => {
  it("re-flows a one-line PEM into something Node can parse", () => {
    const pem = formatPublicKey(oneLinePem);
    expect(pem.startsWith("-----BEGIN PUBLIC KEY-----\n")).toBe(true);
    expect(pem.endsWith("\n-----END PUBLIC KEY-----\n")).toBe(true);
    expect(pem.split("\n").every((l) => l.length <= 64 || l.startsWith("-----"))).toBe(true);
  });

  it("parses a well-formed header and rejects garbage or unsafe key ids", () => {
    expect(parseSignatureHeader(header())?.kid).toBe("key-1");
    expect(parseSignatureHeader(null)).toBeNull();
    expect(parseSignatureHeader("not base64 json")).toBeNull();
    expect(parseSignatureHeader(Buffer.from(JSON.stringify({ kid: "../etc", signature: "x" })).toString("base64"))).toBeNull();
    expect(parseSignatureHeader(Buffer.from(JSON.stringify({ kid: "key-1" })).toString("base64"))).toBeNull();
  });

  it("accepts a genuine signature over the raw body", async () => {
    expect(verifyNotificationSignature(body, parseSignatureHeader(header())!, KEY)).toBe(true);
    await expect(verifyEbayNotification(header(), body, getKey)).resolves.toEqual({ ok: true });
  });

  it("accepts a body that was re-serialised in transit, as eBay's SDK does", () => {
    const pretty = JSON.stringify(JSON.parse(body), null, 2);
    expect(verifyNotificationSignature(pretty, parseSignatureHeader(header())!, KEY)).toBe(true);
  });

  it("rejects a tampered body, a signature from another key, and an unknown key id", async () => {
    const tampered = body.replace('"userId":"u1"', '"userId":"victim"');
    await expect(verifyEbayNotification(header(), tampered, getKey)).resolves.toEqual({ ok: false, reason: "bad_signature" });
    const other = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const forged = createSign("sha1").update(body).sign(other.privateKey, "base64");
    await expect(verifyEbayNotification(header({ signature: forged }), body, getKey)).resolves.toEqual({ ok: false, reason: "bad_signature" });
    await expect(verifyEbayNotification(header({ kid: "key-2" }), body, getKey)).resolves.toEqual({ ok: false, reason: "key_unavailable" });
  });

  it("names the missing or malformed header", async () => {
    await expect(verifyEbayNotification(null, body, getKey)).resolves.toEqual({ ok: false, reason: "missing_header" });
    await expect(verifyEbayNotification("%%%", body, getKey)).resolves.toEqual({ ok: false, reason: "bad_header" });
  });

  it("refuses digests it does not know", () => {
    expect(verifyNotificationSignature(body, parseSignatureHeader(header())!, { ...KEY, digest: "MD5" })).toBe(false);
  });
});
