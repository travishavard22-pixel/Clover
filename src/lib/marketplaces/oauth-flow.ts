import { NextResponse } from "next/server";
import { safeReturnTo, withQuery } from "./return-to";

/**
 * Shared plumbing for the connect → provider → callback round-trip. The `returnTo` path travels
 * in a short-lived, httpOnly cookie scoped to the marketplace routes so it survives the provider
 * redirect without being part of the OAuth `state` (which stays a pure CSRF token).
 */
export const RETURN_COOKIE = "clover_oauth_return";
const RETURN_COOKIE_MAX_AGE = 15 * 60;

export function connectionsUrl(req: Request, params: Record<string, string | null | undefined>, returnTo: string | null = null): URL {
  return new URL(withQuery(returnTo ?? "/connections", params), req.url);
}

export function redirectWithReturn(req: Request, target: string, returnTo: string | null): NextResponse {
  const res = NextResponse.redirect(new URL(target, req.url), 302);
  if (returnTo) res.cookies.set(RETURN_COOKIE, returnTo, { httpOnly: true, sameSite: "lax", secure: new URL(req.url).protocol === "https:", path: "/api/marketplaces", maxAge: RETURN_COOKIE_MAX_AGE });
  return res;
}

export function readReturnCookie(req: Request): string | null {
  const raw = req.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === RETURN_COOKIE) {
      try {
        return safeReturnTo(decodeURIComponent(rest.join("=")));
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function clearReturnCookie(res: NextResponse): NextResponse {
  res.cookies.set(RETURN_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/api/marketplaces", maxAge: 0 });
  return res;
}

export { connectErrorMessage, type ConnectError } from "./connect-errors";
