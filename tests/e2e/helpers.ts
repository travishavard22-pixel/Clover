import { expect, type Page } from "@playwright/test";

export const DEMO = { email: "demo@clover.local", password: "clover-demo-2026" };

/** Waits until the auth form has hydrated so the submit handler (not a native submit) runs. */
export async function waitForAuthForm(page: Page) {
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 60_000 });
}

export async function signIn(page: Page, creds = DEMO) {
  await page.goto("/sign-in", { waitUntil: "networkidle" });
  await waitForAuthForm(page);
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
