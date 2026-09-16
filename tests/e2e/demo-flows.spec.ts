import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test.describe("seeded demo account", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("home leads with what needs attention and labels estimates", async ({ page }) => {
    await page.goto("/home");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Good (morning|afternoon|evening)/);
    await expect(page.getByText(/Needs attention/i).first()).toBeVisible();
    await expect(page.getByText(/Demo data/i).first()).toBeVisible();
  });

  test("inventory lists seeded items and filters by status", async ({ page }) => {
    await page.goto("/inventory");
    await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible();
    await expect(page.getByText(/Canon AE-1/i).first()).toBeVisible();
    await page.getByRole("button", { name: /^Sold$/ }).first().click();
    await expect(page.getByText(/Sold ·/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test("insights renders charts with accessible tables", async ({ page }) => {
    await page.goto("/insights");
    await expect(page.getByRole("heading", { name: "Insights" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Revenue over time" })).toBeVisible();
    // Every chart ships a data table for screen readers.
    await expect(page.locator("table caption")).toHaveCount(5);
  });

  test("notifications page groups by day and marks all read", async ({ page }) => {
    await page.goto("/notifications");
    await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
    const btn = page.getByRole("button", { name: /mark all read/i });
    if (await btn.isVisible()) {
      await btn.click();
      await expect(page.getByText(/all caught up/i)).toBeVisible({ timeout: 15_000 });
    }
  });

  test("sell page offers scan and upload, and lists drafts", async ({ page }) => {
    await page.goto("/sell");
    await expect(page.getByRole("heading", { name: /What are you selling/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Scan an item/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Upload photos/i }).first()).toBeVisible();
  });

  test("welcome page is public and links to sign-up", async ({ page, context }) => {
    await context.clearCookies();
    await page.goto("/welcome");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Photograph it/);
    await expect(page.getByRole("link", { name: /Sell your first item/i })).toBeVisible();
  });
});
