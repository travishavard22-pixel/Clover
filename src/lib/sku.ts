import { randomBytes } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

/** Human-readable SKU: CLV-YYMM-XXXX */
export function generateSku(now = new Date()): string {
  const yy = String(now.getUTCFullYear()).slice(2);
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const bytes = randomBytes(4);
  let tail = "";
  for (let i = 0; i < 4; i++) tail += ALPHABET[bytes[i]! % ALPHABET.length];
  return `CLV-${yy}${mm}-${tail}`;
}
