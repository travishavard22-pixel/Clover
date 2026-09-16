import { afterAll, describe, expect, it } from "vitest";

describe("rate limiter", async () => {
  const { db } = await import("@/lib/db");
  const { rateLimit, rateLimitHeaders } = await import("@/lib/ratelimit");
  afterAll(async () => {
    await db.rateLimitBucket.deleteMany({ where: { key: { startsWith: "test:" } } });
    await db.$disconnect();
  });

  it("counts within a window and blocks past the limit", async () => {
    const key = `test:${Date.now()}`;
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await rateLimit(key, 3, 60));
    expect(results.map((r) => r.ok)).toEqual([true, true, true, false]);
    expect(results[3]!.remaining).toBe(0);
    const h = rateLimitHeaders(results[3]!);
    expect(h["Retry-After"]).toBeDefined();
    expect(h["X-RateLimit-Limit"]).toBe("3");
  });

  it("resets after the window expires", async () => {
    const key = `test:reset:${Date.now()}`;
    await rateLimit(key, 1, 60);
    await db.rateLimitBucket.update({ where: { key }, data: { resetAt: new Date(Date.now() - 1000) } });
    const r = await rateLimit(key, 1, 60);
    expect(r.ok).toBe(true);
    expect(r.remaining).toBe(0);
  });
});
