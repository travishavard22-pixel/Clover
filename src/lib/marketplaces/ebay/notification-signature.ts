import { createVerify } from "node:crypto";
import { getEbayAppToken } from "./app-token";
import { ebayHosts } from "./config";

/**
 * Verification of eBay Notification API deliveries (marketplace account deletion and friends).
 * Every notification carries an `X-EBAY-SIGNATURE` header: base64 JSON `{ alg, kid, signature,
 * digest }`. The signature is an ECDSA signature over the request body, made with a key eBay
 * publishes at `/commerce/notification/v1/public_key/{kid}`. Nothing destructive happens until
 * this check passes — usernames are public, so an unsigned notification could otherwise erase
 * any seller's connection.
 */

export type EbaySignatureHeader = { alg: string; kid: string; signature: string; digest?: string };
export type EbayPublicKey = { algorithm: string; digest: string; key: string };

const KID = /^[A-Za-z0-9._-]{1,128}$/;
const DIGESTS: Record<string, string> = { SHA1: "sha1", SHA256: "sha256" };

export function parseSignatureHeader(value: string | null): EbaySignatureHeader | null {
  if (!value) return null;
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64").toString("utf8")) as Partial<EbaySignatureHeader> | null;
    if (!decoded || typeof decoded !== "object") return null;
    if (typeof decoded.kid !== "string" || !KID.test(decoded.kid)) return null;
    if (typeof decoded.signature !== "string" || !decoded.signature || decoded.signature.length > 4096) return null;
    return { alg: String(decoded.alg ?? ""), kid: decoded.kid, signature: decoded.signature, digest: typeof decoded.digest === "string" ? decoded.digest : undefined };
  } catch {
    return null;
  }
}

/** eBay returns the PEM on a single line; Node wants the header, footer and body on their own lines. */
export function formatPublicKey(key: string): string {
  const body = key.replace(/-----BEGIN PUBLIC KEY-----/g, "").replace(/-----END PUBLIC KEY-----/g, "").replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g) ?? [body];
  return `-----BEGIN PUBLIC KEY-----\n${lines.join("\n")}\n-----END PUBLIC KEY-----\n`;
}

/**
 * Checks the signature over the raw body. eBay's own SDK verifies the re-serialised JSON, so a
 * body that was pretty-printed in transit is tried in compact form as well.
 */
export function verifyNotificationSignature(rawBody: string, header: EbaySignatureHeader, publicKey: EbayPublicKey): boolean {
  const digest = DIGESTS[(publicKey.digest || header.digest || "SHA1").toUpperCase()];
  if (!digest) return false;
  const pem = formatPublicKey(publicKey.key);
  const candidates = [rawBody];
  try {
    const compact = JSON.stringify(JSON.parse(rawBody));
    if (compact !== rawBody) candidates.push(compact);
  } catch {
    // not JSON — only the raw body can match
  }
  for (const candidate of candidates) {
    try {
      const verifier = createVerify(digest);
      verifier.update(candidate, "utf8");
      if (verifier.verify(pem, header.signature, "base64")) return true;
    } catch {
      // malformed key or signature encoding — treat as a failed check
    }
  }
  return false;
}

type CachedKey = { key: EbayPublicKey; fetchedAt: number };
const g = globalThis as unknown as { __ebayNotificationKeys?: Map<string, CachedKey> };
const KEY_CACHE_MS = 24 * 60 * 60 * 1000;

/** Fetches (and caches for a day) the public key eBay signed a notification with. */
export async function fetchEbayPublicKey(kid: string): Promise<EbayPublicKey> {
  if (!KID.test(kid)) throw new Error("Invalid key id");
  const cache = (g.__ebayNotificationKeys ??= new Map());
  const hit = cache.get(kid);
  if (hit && Date.now() - hit.fetchedAt < KEY_CACHE_MS) return hit.key;
  const token = await getEbayAppToken();
  const res = await fetch(`${ebayHosts().api}/commerce/notification/v1/public_key/${encodeURIComponent(kid)}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  if (!res.ok) throw new Error(`eBay public key lookup failed (${res.status})`);
  const data = (await res.json()) as Partial<EbayPublicKey> | null;
  if (!data || typeof data.key !== "string" || !data.key) throw new Error("eBay public key response had no key");
  const key: EbayPublicKey = { algorithm: String(data.algorithm ?? "ECDSA"), digest: String(data.digest ?? "SHA1"), key: data.key };
  cache.set(kid, { key, fetchedAt: Date.now() });
  return key;
}

export type VerifyOutcome = { ok: true } | { ok: false; reason: "missing_header" | "bad_header" | "key_unavailable" | "bad_signature" };

/** Full check for a request: header present and well-formed, key obtainable, signature valid. */
export async function verifyEbayNotification(headerValue: string | null, rawBody: string, getKey: (kid: string) => Promise<EbayPublicKey> = fetchEbayPublicKey): Promise<VerifyOutcome> {
  if (!headerValue) return { ok: false, reason: "missing_header" };
  const header = parseSignatureHeader(headerValue);
  if (!header) return { ok: false, reason: "bad_header" };
  let key: EbayPublicKey;
  try {
    key = await getKey(header.kid);
  } catch {
    return { ok: false, reason: "key_unavailable" };
  }
  return verifyNotificationSignature(rawBody, header, key) ? { ok: true } : { ok: false, reason: "bad_signature" };
}
