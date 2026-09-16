import { expect, type Page } from "@playwright/test";

export const DEMO = { email: "demo@clover.local", password: "clover-demo-2026" };

export async function signIn(page: Page, creds = DEMO) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(creds.email);
  await page.getByLabel("Password").fill(creds.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/(home|onboarding)/, { timeout: 30_000 });
}

/** Sets the theme the same way the app's toggle does, then waits a frame. */
export async function setTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
  await page.waitForTimeout(100);
}
