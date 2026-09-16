import { env } from "../../env";

export const NEXTDOOR_AUTHORIZE_URL = "https://www.nextdoor.com/v3/authorize/";
export const NEXTDOOR_TOKEN_URL = "https://auth.nextdoor.com/v2/token";
export const NEXTDOOR_SCOPES = ["openid", "post:write", "post:read"] as const;

export function nextdoorRedirectUri(): string {
  return new URL("/api/marketplaces/nextdoor/callback", env.APP_URL).toString();
}

/** developer.nextdoor.com → sharing-get-authorization-code. Scope is space-delimited and URL-encoded. */
export function nextdoorAuthorizeUrl(state: string): string {
  if (!env.NEXTDOOR_CLIENT_ID) throw new Error("Nextdoor credentials are not configured");
  const u = new URL(NEXTDOOR_AUTHORIZE_URL);
  u.searchParams.set("scope", NEXTDOOR_SCOPES.join(" "));
  u.searchParams.set("client_id", env.NEXTDOOR_CLIENT_ID);
  u.searchParams.set("redirect_uri", nextdoorRedirectUri());
  u.searchParams.set("response_type", "code");
  u.searchParams.set("state", state);
  return u.toString();
}

export type NextdoorTokens = { accessToken: string; expiresAt: Date; refreshToken: string | null; idToken: string | null; scopes: string[] };

type TokenResponse = { access_token: string; expires_in?: number; refresh_token?: string; id_token?: string; scope?: string; token_type?: string };

function basic() {
  if (!env.NEXTDOOR_CLIENT_ID || !env.NEXTDOOR_CLIENT_SECRET) throw new Error("Nextdoor credentials are not configured");
  return `Basic ${Buffer.from(`${env.NEXTDOOR_CLIENT_ID}:${env.NEXTDOOR_CLIENT_SECRET}`).toString("base64")}`;
}

async function tokenRequest(body: URLSearchParams): Promise<NextdoorTokens> {
  const res = await fetch(NEXTDOOR_TOKEN_URL, { method: "POST", headers: { Authorization: basic(), "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body });
  const text = await res.text();
  if (!res.ok) throw new NextdoorAuthError(`Nextdoor token request failed (${res.status}): ${text.slice(0, 200)}`, res.status, text);
  const data = JSON.parse(text) as TokenResponse;
  return {
    accessToken: data.access_token,
    // Documented examples are 7 days and 1 year; when absent we assume the shorter one.
    expiresAt: new Date(Date.now() + (data.expires_in ?? 604_800) * 1000),
    refreshToken: data.refresh_token ?? null,
    idToken: data.id_token ?? null,
    scopes: data.scope ? data.scope.split(/\s+/).filter(Boolean) : [...NEXTDOOR_SCOPES],
  };
}

export class NextdoorAuthError extends Error {
  constructor(message: string, public status: number, public body = "") {
    super(message);
    this.name = "NextdoorAuthError";
  }
  /** True when Nextdoor says the grant is gone and the user must re-consent. */
  get invalidGrant(): boolean {
    return this.status === 400 && /invalid_grant/i.test(this.body);
  }
}

export async function exchangeNextdoorCode(code: string): Promise<NextdoorTokens> {
  return tokenRequest(new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: nextdoorRedirectUri() }));
}

export async function refreshNextdoorToken(refreshToken: string): Promise<NextdoorTokens> {
  return tokenRequest(new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }));
}

/** Best-effort display name from the OpenID `id_token` (unverified claims; only used as a label). */
export function displayNameFromIdToken(idToken: string | null): string | null {
  if (!idToken) return null;
  const parts = idToken.split(".");
  if (parts.length < 2) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[1]!.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as Record<string, unknown>;
    const name = [claims.name, claims.preferred_username, claims.given_name].find((v) => typeof v === "string" && v.trim());
    return typeof name === "string" ? name : null;
  } catch {
    return null;
  }
}
