import { createSign, sign as signRaw } from "node:crypto";

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/** RS256 JWT for Google service accounts (FCM HTTP v1 token exchange). */
export function signJwtRs256(claims: Record<string, unknown>, privateKeyPem: string, header: Record<string, unknown> = {}): string {
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT", ...header }));
  const body = b64url(JSON.stringify(claims));
  const signer = createSign("RSA-SHA256");
  signer.update(`${head}.${body}`);
  return `${head}.${body}.${b64url(signer.sign(privateKeyPem))}`;
}

/** ES256 JWT for APNs provider authentication (raw r||s signature, as JOSE requires). */
export function signJwtEs256(claims: Record<string, unknown>, privateKeyPem: string, header: Record<string, unknown> = {}): string {
  const head = b64url(JSON.stringify({ alg: "ES256", typ: "JWT", ...header }));
  const body = b64url(JSON.stringify(claims));
  const sig = signRaw("sha256", Buffer.from(`${head}.${body}`), { key: privateKeyPem, dsaEncoding: "ieee-p1363" });
  return `${head}.${body}.${b64url(sig)}`;
}
