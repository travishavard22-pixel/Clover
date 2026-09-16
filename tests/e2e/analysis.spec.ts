import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { signIn } from "./helpers";

/**
 * End-to-end: upload a photo → review → analyze → live checklist → item page.
 * Runs entirely on the Demo providers; the in-process worker executes the job.
 */
test("upload → analyze → review", async ({ page }) => {
  const request = page.request;
  await signIn(page);

  // Create the item and upload a generated JPEG through the real API.
  const created = await request.post("/api/items", { data: { title: "Keychron K2 mechanical keyboard" } });
  expect(created.ok()).toBeTruthy();
  const { item } = await created.json();
  const jpeg = await sharp({ create: { width: 640, height: 480, channels: 3, background: { r: 40, g: 60, b: 120 } } }).jpeg().toBuffer();
  const upload = await request.post(`/api/items/${item.id}/photos`, { multipart: { file: { name: "front.jpg", mimeType: "image/jpeg", buffer: jpeg } } });
  expect(upload.ok()).toBeTruthy();

  await page.goto(`/sell/review/${item.id}`);
  await expect(page.getByRole("heading", { name: /Review photos/i })).toBeVisible();
  await page.getByRole("button", { name: /Continue/i }).click();
  await expect(page).toHaveURL(/\/analyzing/, { timeout: 30_000 });

  // Real step lines, then the reveal, then the item page.
  await expect(page.getByText(/Identifying the item|Identified as/i).first()).toBeVisible({ timeout: 60_000 });
  await expect(page).toHaveURL(new RegExp(`/items/${item.id}$`), { timeout: 120_000 });
});
