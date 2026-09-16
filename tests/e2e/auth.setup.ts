import { test as setup } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { DEMO, waitForAuthForm } from "./helpers";

const STATE = "test-results/.auth/demo.json";

setup("sign in as the demo seller", async ({ page }) => {
  mkdirSync("test-results/.auth", { recursive: true });
  await page.goto("/sign-in", { waitUntil: "networkidle" });
  await waitForAuthForm(page);
  await page.getByLabel("Email").fill(DEMO.email);
  await page.getByLabel("Password").fill(DEMO.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/home/, { timeout: 60_000 });
  await page.context().storageState({ path: STATE });
});
