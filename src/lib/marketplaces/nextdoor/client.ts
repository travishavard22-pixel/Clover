import { db, type MarketplaceConnection } from "../../db";
import { decryptSecret, encryptSecret } from "../../crypto";
import { NextdoorAuthError, refreshNextdoorToken } from "./oauth";

export const NEXTDOOR_API_BASE = "https://nextdoor.com/external/api/partner/v1";
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const MAX_RETRIES = 2;
const BACKOFF_MS = [600, 1800];

export class NextdoorApiError extends Error {
  constructor(message: string, public status: number, public body = "", public retryable = status >= 500 || status === 429) {
    super(message);
    this.name = "NextdoorApiError";
  }
}

export class NextdoorReauthError extends Error {
  constructor(message = "Nextdoor authorization expired. Reconnect Nextdoor to continue.") {
    super(message);
    this.name = "NextdoorReauthError";
  }
}

/** Access token for a connection; refreshes when fewer than 5 minutes remain and persists it encrypted. */
export async function getNextdoorAccessToken(c: MarketplaceConnection): Promise<string> {
  if (c.accessTokenEnc && c.accessTokenExpiresAt && c.accessTokenExpiresAt.getTime() - Date.now() > REFRESH_MARGIN_MS) return decryptSecret(c.accessTokenEnc);
  if (!c.refreshTokenEnc) {
    if (c.accessTokenEnc) return decryptSecret(c.accessTokenEnc); // no refresh token issued; use until it fails
    throw new NextdoorReauthError("Nextdoor is not connected.");
  }
  try {
    const t = await refreshNextdoorToken(decryptSecret(c.refreshTokenEnc));
    await db.marketplaceConnection.update({
      where: { id: c.id },
      data: { accessTokenEnc: encryptSecret(t.accessToken), accessTokenExpiresAt: t.expiresAt, ...(t.refreshToken ? { refreshTokenEnc: encryptSecret(t.refreshToken) } : {}), lastError: null, ...(c.status !== "CONNECTED" ? { status: "CONNECTED" } : {}) },
    });
    return t.accessToken;
  } catch (err) {
    if (err instanceof NextdoorAuthError && err.invalidGrant) {
      await db.marketplaceConnection.update({ where: { id: c.id }, data: { status: "NEEDS_REAUTH", lastError: "Nextdoor authorization expired or was revoked.", accessTokenEnc: null, accessTokenExpiresAt: null } });
      throw new NextdoorReauthError();
    }
    throw err;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Typed JSON fetch against the Nextdoor partner API with the user's token; ≤2 retries on 5xx/429. */
export async function nextdoorFetch<T>(c: MarketplaceConnection, req: { method?: "GET" | "POST" | "PUT" | "DELETE"; path: string; body?: unknown }): Promise<T> {
  const token = await getNextdoorAccessToken(c);
  const url = `${NEXTDOOR_API_BASE}${req.path}`;
  let last: NextdoorApiError | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { method: req.method ?? "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(req.body !== undefined ? { "Content-Type": "application/json" } : {}) }, body: req.body !== undefined ? JSON.stringify(req.body) : undefined });
    } catch (e) {
      last = new NextdoorApiError(`Could not reach Nextdoor: ${e instanceof Error ? e.message : String(e)}`, 503, "", true);
      if (attempt < MAX_RETRIES) {
        await sleep(BACKOFF_MS[attempt]!);
        continue;
      }
      throw last;
    }
    const text = await res.text();
    if (res.ok) return (text ? JSON.parse(text) : undefined) as T;
    if (res.status === 401) throw new NextdoorReauthError();
    last = new NextdoorApiError(`Nextdoor ${req.method ?? "GET"} ${req.path} failed (${res.status})`, res.status, text);
    if (!last.retryable || attempt === MAX_RETRIES) throw last;
    await sleep(BACKOFF_MS[attempt]!);
  }
  throw last ?? new NextdoorApiError("Nextdoor request failed", 500);
}
