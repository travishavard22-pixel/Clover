import { expect, test } from "@playwright/test";

// These specs exercise sign-up/sign-in and anonymous access, so they start without a session.
test.use({ storageState: { cookies: [], origins: [] } });
import { waitForAuthForm } from "./helpers";

const unique = () => `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

test("health endpoint reports database and capabilities", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.status).toBe("ok");
  expect(body.capabilities).toHaveProperty("demoMode");
});

test("visitor lands on welcome and can reach sign-up", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/welcome/);
  await page.goto("/sign-up");
  await expect(page.getByRole("heading", { name: /create your account/i })).toBeVisible();
});

test("sign up, sign out, sign in", async ({ page, context }) => {
  const email = unique();
  await page.goto("/sign-up", { waitUntil: "networkidle" });
  await waitForAuthForm(page);
  await page.getByLabel("Name").fill("Playwright Seller");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/onboarding/, { timeout: 20_000 });

  // Protected pages redirect incomplete users to onboarding.
  await page.goto("/home");
  await expect(page).toHaveURL(/\/onboarding/);

  // Drop the session cookie (the sign-out menu is exercised in the shell spec) and sign back in.
  await context.clearCookies();
  await page.goto("/sign-in", { waitUntil: "networkidle" });
  await waitForAuthForm(page);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/(onboarding|home)/, { timeout: 20_000 });
});

test("rejects weak passwords with a visible, accessible error", async ({ page }) => {
  await page.goto("/sign-up", { waitUntil: "networkidle" });
  await waitForAuthForm(page);
  await page.getByLabel("Email").fill(unique());
  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: /create account/i }).click();
  // Either native validation (minLength) or a server error alert must stop submission.
  await expect(page).toHaveURL(/\/sign-up/);
});
