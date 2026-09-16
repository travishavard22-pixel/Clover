/**
 * Validates a `returnTo` path supplied by the client before we redirect to it after an OAuth
 * round-trip. Only same-origin, absolute-path URLs are accepted; anything that could leave the
 * app (schemes, protocol-relative `//host`, backslashes, control characters) is dropped and the
 * caller falls back to `/connections`.
 */
export function safeReturnTo(input: string | null | undefined): string | null {
  if (!input) return null;
  const value = input.trim();
  if (value.length === 0 || value.length > 1024) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//") || value.startsWith("/\\")) return null;
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code === 127 || ch === " ") return null;
  }
  if (/^\/api\//i.test(value)) return null;
  return value;
}

/** Appends query parameters to an in-app path, preserving any it already has. */
export function withQuery(path: string, params: Record<string, string | null | undefined>): string {
  const [base = "/", existing = ""] = path.split("?", 2);
  const search = new URLSearchParams(existing);
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "") search.set(k, v);
  const q = search.toString();
  return q ? `${base}?${q}` : base;
}
