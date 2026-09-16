import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "./env";
import { requireUserApi } from "./session";
import { clientIp, rateLimit, rateLimitHeaders } from "./ratelimit";

/** Baseline for every signed-in route, so nothing is unthrottled by omission. Route-specific limits stack on top. */
const BASELINE_USER_LIMIT = { limit: env.NODE_ENV === "production" ? 1200 : 20_000, windowSeconds: 600 };

export type ApiUser = { id: string; name: string; email: string };

export class ApiError extends Error {
  constructor(public status: number, message: string, public code = "error", public details?: unknown) {
    super(message);
  }
}

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function apiError(status: number, message: string, code = "error", details?: unknown) {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

/**
 * Wraps a route handler with auth, optional rate limiting and uniform error mapping.
 * Usage: export const POST = withUser(async (req, { user, params }) => { ... })
 */
export function withUser<P extends Record<string, string> = Record<string, string>>(
  handler: (req: Request, ctx: { user: ApiUser; params: P }) => Promise<Response>,
  opts: { rateLimit?: { key: string; limit: number; windowSeconds: number } } = {},
) {
  return async (req: Request, ctx?: { params?: Promise<P> | P }) => {
    try {
      const user = await requireUserApi(req);
      if (!user) return apiError(401, "Sign in required", "unauthorized");
      const baseline = await rateLimit(`api:user:${user.id}`, BASELINE_USER_LIMIT.limit, BASELINE_USER_LIMIT.windowSeconds);
      if (!baseline.ok) return NextResponse.json({ error: { code: "rate_limited", message: "Too many requests. Please slow down." } }, { status: 429, headers: rateLimitHeaders(baseline) });
      if (opts.rateLimit) {
        const r = await rateLimit(`${opts.rateLimit.key}:user:${user.id}`, opts.rateLimit.limit, opts.rateLimit.windowSeconds);
        if (!r.ok) return NextResponse.json({ error: { code: "rate_limited", message: "Too many requests. Please slow down." } }, { status: 429, headers: rateLimitHeaders(r) });
      }
      const params = ((await ctx?.params) ?? {}) as P;
      return await handler(req, { user: { id: user.id, name: user.name, email: user.email }, params });
    } catch (err) {
      return handleApiError(err);
    }
  };
}

export function withPublic(handler: (req: Request, ctx: { params: Record<string, string>; ip: string }) => Promise<Response>, opts: { rateLimit?: { key: string; limit: number; windowSeconds: number } } = {}) {
  return async (req: Request, ctx?: { params?: Promise<Record<string, string>> | Record<string, string> }) => {
    try {
      const ip = clientIp(req);
      if (opts.rateLimit) {
        const r = await rateLimit(`${opts.rateLimit.key}:ip:${ip}`, opts.rateLimit.limit, opts.rateLimit.windowSeconds);
        if (!r.ok) return NextResponse.json({ error: { code: "rate_limited", message: "Too many requests." } }, { status: 429, headers: rateLimitHeaders(r) });
      }
      const params = ((await ctx?.params) ?? {}) as Record<string, string>;
      return await handler(req, { params, ip });
    } catch (err) {
      return handleApiError(err);
    }
  };
}

export function handleApiError(err: unknown) {
  if (err instanceof ApiError) return apiError(err.status, err.message, err.code, err.details);
  if (err instanceof z.ZodError) return apiError(400, "Invalid request", "validation", err.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  console.error("[api]", err);
  return apiError(500, "Something went wrong on our side. Your data is safe — please try again.", "internal");
}

export async function parseBody<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, "Request body must be JSON", "bad_json");
  }
  return schema.parse(body);
}

export function parseQuery<S extends z.ZodType>(req: Request, schema: S): z.infer<S> {
  const url = new URL(req.url);
  return schema.parse(Object.fromEntries(url.searchParams.entries()));
}
