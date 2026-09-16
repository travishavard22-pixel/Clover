import { env } from "../../env";
import { ebayHosts, EBAY_USER_SCOPES } from "./config";
import { ebayRequestWithToken } from "./client";
import { EbayApiError } from "./errors";

/** Authorization-code URL. `state` is our CSRF token (stored server-side, single use). */
export function ebayAuthorizeUrl(state: string): string {
  if (!env.EBAY_CLIENT_ID || !env.EBAY_RU_NAME) throw new Error("eBay credentials are not configured");
  const u = new URL(`${ebayHosts().auth}/oauth2/authorize`);
  u.searchParams.set("client_id", env.EBAY_CLIENT_ID);
  u.searchParams.set("redirect_uri", env.EBAY_RU_NAME);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", EBAY_USER_SCOPES.join(" "));
  u.searchParams.set("state", state);
  return u.toString();
}

export type EbayUserTokens = { accessToken: string; expiresAt: Date; refreshToken: string; refreshExpiresAt: Date | null; scopes: string[] };

/** POST /identity/v1/oauth2/token grant_type=authorization_code */
export async function exchangeEbayCode(code: string): Promise<EbayUserTokens> {
  if (!env.EBAY_CLIENT_ID || !env.EBAY_CLIENT_SECRET || !env.EBAY_RU_NAME) throw new Error("eBay credentials are not configured");
  const basic = Buffer.from(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${ebayHosts().api}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: env.EBAY_RU_NAME }),
  });
  const text = await res.text();
  if (!res.ok) throw new EbayApiError(`eBay code exchange failed (${res.status}): ${text.slice(0, 200)}`, res.status, [], false);
  const data = JSON.parse(text) as { access_token: string; expires_in: number; refresh_token: string; refresh_token_expires_in?: number };
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    refreshToken: data.refresh_token,
    refreshExpiresAt: data.refresh_token_expires_in ? new Date(Date.now() + data.refresh_token_expires_in * 1000) : null,
    scopes: EBAY_USER_SCOPES,
  };
}

export type EbayIdentity = { userId: string; username: string; accountType?: string };

/** GET /commerce/identity/v1/user/ — the eBay username and immutable user id. */
export async function getEbayIdentity(accessToken: string): Promise<EbayIdentity> {
  const res = await ebayRequestWithToken(accessToken, { path: "/commerce/identity/v1/user/" });
  const data = (await res.json()) as { userId: string; username: string; accountType?: string };
  return { userId: data.userId, username: data.username, accountType: data.accountType };
}
