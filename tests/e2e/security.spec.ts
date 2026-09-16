import { expect, test } from "@playwright/test";

test("security headers and CSP are present", async ({ request }) => {
  const res = await request.get("/sign-in");
  const h = res.headers();
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["content-security-policy"]).toMatch(/nonce-/);
});

test("file route refuses unsigned and foreign keys", async ({ request }) => {
  const a = await request.get("/api/files/users/someone/items/x/p-web.jpg");
  expect(a.status()).toBe(404);
  const b = await request.get("/api/files/..%2F..%2Fetc%2Fpasswd");
  expect([400, 404]).toContain(b.status());
});

test("protected APIs require a session", async ({ request }) => {
  const res = await request.post("/api/items", { data: {} });
  expect(res.status()).toBe(401);
});
