import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Envelope-style symmetric encryption for marketplace tokens.
 *
 * CLOVER_ENCRYPTION_KEYS="v2:<base64 32 bytes>,v1:<base64 32 bytes>"
 *  - the first key is used for new encryptions
 *  - every listed key can decrypt (rotation: add a new key in front, re-encrypt lazily, drop the old one)
 *
 * Ciphertext format: `${keyId}.${iv_b64}.${tag_b64}.${data_b64}`
 */
export type KeyRing = { primary: { id: string; key: Buffer }; all: Map<string, Buffer> };

export function parseKeyRing(spec: string): KeyRing {
  const entries = spec
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pair) => {
      const idx = pair.indexOf(":");
      if (idx <= 0) throw new Error("CLOVER_ENCRYPTION_KEYS entries must look like 'v1:<base64>'");
      const id = pair.slice(0, idx);
      const key = Buffer.from(pair.slice(idx + 1), "base64");
      if (key.length !== 32) throw new Error(`Encryption key '${id}' must decode to exactly 32 bytes`);
      return { id, key };
    });
  if (entries.length === 0) throw new Error("CLOVER_ENCRYPTION_KEYS is empty");
  return { primary: entries[0]!, all: new Map(entries.map((e) => [e.id, e.key])) };
}

let ring: KeyRing | null = null;
function getRing(): KeyRing {
  if (!ring) {
    // Imported lazily so unit tests can construct rings directly.
    ring = parseKeyRing(process.env.CLOVER_ENCRYPTION_KEYS ?? "");
  }
  return ring;
}

export function encryptSecret(plaintext: string, keyRing: KeyRing = getRing()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyRing.primary.key, iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [keyRing.primary.id, iv.toString("base64"), tag.toString("base64"), data.toString("base64")].join(".");
}

export function decryptSecret(ciphertext: string, keyRing: KeyRing = getRing()): string {
  const [keyId, ivB64, tagB64, dataB64] = ciphertext.split(".");
  if (!keyId || !ivB64 || !tagB64 || !dataB64) throw new Error("Malformed ciphertext");
  const key = keyRing.all.get(keyId);
  if (!key) throw new Error(`No decryption key for id '${keyId}'`);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

/** True if the ciphertext was produced with a key other than the current primary (i.e. should be re-encrypted). */
export function needsRotation(ciphertext: string, keyRing: KeyRing = getRing()): boolean {
  return ciphertext.split(".")[0] !== keyRing.primary.id;
}

export function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
