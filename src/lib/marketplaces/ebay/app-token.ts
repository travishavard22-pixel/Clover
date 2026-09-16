import { env } from "../../env";
import { ebayHosts, EBAY_SCOPES } from "./config";

type Token = { accessToken: string; expiresAt: number };
const g = globalThis as unknown as { __ebayAppToken?: Token };

/** Client-credentials application token for public data APIs (Browse, Taxonomy). Cached in memory until 60s before expiry. */
export async function getEbayAppToken(scopes: string[] = [EBAY_SCOPES.public]): Promise<string> {
  const cached = g.__ebayAppToken;
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.accessToken;
  if (!env.EBAY_CLIENT_ID || !env.EBAY_CLIENT_SECRET) throw new Error("eBay credentials are not configured");
  const basic = Buffer.from(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${ebayHosts().api}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: scopes.join(" ") }),
  });
  if (!res.ok) throw new Error(`eBay app token request failed (${res.status})`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  g.__ebayAppToken = { accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}
