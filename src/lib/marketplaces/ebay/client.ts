import { db, type MarketplaceConnection } from "../../db";
import { decryptSecret, encryptSecret, needsRotation } from "../../crypto";
import { env } from "../../env";
import { ebayHosts, EBAY_USER_SCOPES } from "./config";
import { EbayApiError, EbayReauthError, type EbayErrorDetail } from "./errors";

const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const MAX_RETRIES = 2;
const BACKOFF_MS = [600, 1800];

type Host = "api" | "apim";

export type EbayRequest = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  host?: Host;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  /** Raw multipart/form-data body (Media API upload). */
  form?: FormData;
  /** Return the Response instead of parsed JSON (needed for `Location` headers). */
  raw?: boolean;
};

type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string; refresh_token_expires_in?: number; token_type?: string };

function basicAuth() {
  if (!env.EBAY_CLIENT_ID || !env.EBAY_CLIENT_SECRET) throw new Error("eBay credentials are not configured");
  return `Basic ${Buffer.from(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`).toString("base64")}`;
}

/** Exchange a refresh token for a new access token. Persists it encrypted; flags NEEDS_REAUTH on `invalid_grant`. */
export async function refreshUserToken(connection: MarketplaceConnection): Promise<{ accessToken: string; expiresAt: Date }> {
  if (!connection.refreshTokenEnc) throw new EbayReauthError("eBay is not connected.");
  const refreshToken = decryptSecret(connection.refreshTokenEnc);
  const res = await fetch(`${ebayHosts().api}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, scope: (connection.scopes.length ? connection.scopes : EBAY_USER_SCOPES).join(" ") }),
  });
  const text = await res.text();
  if (!res.ok) {
    let code = "";
    try {
      code = (JSON.parse(text) as { error?: string }).error ?? "";
    } catch {
      /* not json */
    }
    if (res.status === 400 && (code === "invalid_grant" || code === "invalid_scope")) {
      await db.marketplaceConnection.update({ where: { id: connection.id }, data: { status: "NEEDS_REAUTH", lastError: "eBay authorization expired or was revoked.", accessTokenEnc: null, accessTokenExpiresAt: null } });
      throw new EbayReauthError();
    }
    throw new EbayApiError(`eBay token refresh failed (${res.status})`, res.status, [], res.status >= 500);
  }
  const data = JSON.parse(text) as TokenResponse;
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);
  const update: Parameters<typeof db.marketplaceConnection.update>[0]["data"] = { accessTokenEnc: encryptSecret(data.access_token), accessTokenExpiresAt: expiresAt, lastError: null };
  if (needsRotation(connection.refreshTokenEnc)) update.refreshTokenEnc = encryptSecret(refreshToken);
  if (connection.status === "NEEDS_REAUTH" || connection.status === "ERROR") update.status = "CONNECTED";
  await db.marketplaceConnection.update({ where: { id: connection.id }, data: update });
  return { accessToken: data.access_token, expiresAt };
}

const inflight = new Map<string, Promise<string>>();

/** Access token for a user connection, refreshing when fewer than 5 minutes remain. De-duplicates concurrent refreshes. */
export async function getUserAccessToken(connection: MarketplaceConnection): Promise<string> {
  if (connection.accessTokenEnc && connection.accessTokenExpiresAt && connection.accessTokenExpiresAt.getTime() - Date.now() > REFRESH_MARGIN_MS) {
    return decryptSecret(connection.accessTokenEnc);
  }
  const existing = inflight.get(connection.id);
  if (existing) return existing;
  const p = refreshUserToken(connection)
    .then((t) => t.accessToken)
    .finally(() => inflight.delete(connection.id));
  inflight.set(connection.id, p);
  return p;
}

function parseErrors(text: string): EbayErrorDetail[] {
  try {
    const json = JSON.parse(text) as { errors?: EbayErrorDetail[]; error?: string; error_description?: string };
    if (Array.isArray(json.errors)) return json.errors;
    if (json.error) return [{ message: json.error, longMessage: json.error_description }];
  } catch {
    /* not json */
  }
  return text ? [{ message: text.slice(0, 300) }] : [];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Typed fetch against eBay's REST APIs with the user's OAuth token. Retries at most twice, only on
 * 5xx/429 (an explicit eBay Application Growth Check criterion), with backoff and `Retry-After`.
 */
export async function ebayUserFetch<T = unknown>(connection: MarketplaceConnection, req: EbayRequest): Promise<T> {
  const res = await ebayUserRequest(connection, req);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export async function ebayUserRequest(connection: MarketplaceConnection, req: EbayRequest): Promise<Response> {
  const token = await getUserAccessToken(connection);
  return ebayRequestWithToken(token, req);
}

/** Same as above but with a caller-supplied bearer (application tokens for Taxonomy, or a freshly exchanged user token). */
export async function ebayRequestWithToken(token: string, req: EbayRequest): Promise<Response> {
  const hosts = ebayHosts();
  const base = req.host === "apim" ? hosts.apim : hosts.api;
  const url = new URL(req.path, base);
  for (const [k, v] of Object.entries(req.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Accept-Language": "en-US",
    "Content-Language": "en-US",
    "X-EBAY-C-MARKETPLACE-ID": env.EBAY_MARKETPLACE_ID,
    ...req.headers,
  };
  let body: BodyInit | undefined;
  if (req.form) body = req.form;
  else if (req.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(req.body);
  }

  let lastErr: EbayApiError | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { method: req.method ?? "GET", headers, body });
    } catch (e) {
      lastErr = new EbayApiError(`Could not reach eBay: ${e instanceof Error ? e.message : String(e)}`, 503, [], true);
      if (attempt < MAX_RETRIES) {
        await sleep(BACKOFF_MS[attempt]!);
        continue;
      }
      throw lastErr;
    }
    if (res.ok) return res;
    const text = await res.text().catch(() => "");
    const errors = parseErrors(text);
    lastErr = new EbayApiError(`eBay ${req.method ?? "GET"} ${url.pathname} failed (${res.status}): ${errors[0]?.longMessage ?? errors[0]?.message ?? ""}`.trim(), res.status, errors);
    if (!lastErr.retryable || attempt === MAX_RETRIES) throw lastErr;
    const retryAfter = Number(res.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 10_000) : BACKOFF_MS[attempt]!);
  }
  throw lastErr ?? new EbayApiError("eBay request failed", 500);
}
