"use client";

/** Error shape thrown by `apiRequest` — mirrors `{ error: { code, message, details } }` from `src/lib/api.ts`. */
export class ApiRequestError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "error",
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export async function readApiError(res: Response): Promise<ApiRequestError> {
  let message = res.status === 429 ? "Too many requests. Give it a moment." : `Request failed (${res.status})`;
  let code = "error";
  let details: unknown;
  try {
    const body = (await res.json()) as { error?: { message?: string; code?: string; details?: unknown } };
    message = body.error?.message ?? message;
    code = body.error?.code ?? code;
    details = body.error?.details;
  } catch {
    // non-JSON error body; keep the generic message
  }
  return new ApiRequestError(res.status, message, code, details);
}

/** JSON in, JSON out. Throws `ApiRequestError` with the server's message so the UI can show what happened. */
export async function apiRequest<T>(input: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json: body, ...rest } = init;
  const res = await fetch(input, {
    ...rest,
    body: body !== undefined ? JSON.stringify(body) : rest.body,
    headers: { Accept: "application/json", ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers ?? {}) },
  });
  if (!res.ok) throw await readApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function errorMessage(err: unknown, fallback = "Something went wrong. Your data is safe — please try again."): string {
  if (err instanceof ApiRequestError) return err.message;
  if (err instanceof Error && err.name !== "AbortError" && err.message) return err.message;
  return fallback;
}
