/**
 * Small fetch wrapper for the marketplace feature routes. Errors carry the server's message and
 * code so the UI can show exactly what happened and keep the user's input.
 */
export class RequestError extends Error {
  constructor(message: string, public status: number, public code: string, public details?: unknown) {
    super(message);
  }
}

type ErrorBody = { error?: { code?: string; message?: string; details?: unknown } };

export async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...init, headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers ?? {}) }, credentials: "same-origin" });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const e = (body as ErrorBody | null)?.error;
    throw new RequestError(e?.message ?? `Request failed (${res.status})`, res.status, e?.code ?? "error", e?.details);
  }
  return body as T;
}

export const post = <T>(url: string, body?: unknown) => request<T>(url, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
export const put = <T>(url: string, body?: unknown) => request<T>(url, { method: "PUT", body: body === undefined ? undefined : JSON.stringify(body) });
export const get = <T>(url: string) => request<T>(url, { method: "GET", cache: "no-store" });

/** Copies text; resolves false when the clipboard is unavailable so the UI can show a select-and-copy fallback. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through
  }
  return false;
}
