import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge proxy: per-request nonce-based Content Security Policy and a few hardening headers.
 * Next.js reads the nonce from the CSP header and applies it to its own inline scripts; the root
 * layout reads `x-nonce` for the theme bootstrap script.
 */
export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.getRandomValues(new Uint8Array(16)).reduce((s, b) => s + String.fromCharCode(b), ""));
  const dev = process.env.NODE_ENV !== "production";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://i.ebayimg.com https://*.ebayimg.com https://*.ebaystatic.com",
    "font-src 'self' data:",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    dev ? "" : "upgrade-insecure-requests",
  ]
    .filter(Boolean)
    .join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  matcher: [
    // Skip static assets and prefetches; API routes get the headers from next.config.
    { source: "/((?!_next/static|_next/image|favicon.ico|brand/|api/).*)", missing: [{ type: "header", key: "next-router-prefetch" }, { type: "header", key: "purpose", value: "prefetch" }] },
  ],
};
