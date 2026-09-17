import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

/**
 * Automated accessibility scan (axe-core) across the main routes.
 * Fails only on "serious"/"critical" violations; "moderate"/"minor" are logged and attached.
 */

// Scan with reduced motion. Cards fade in from opacity 0 with a per-index stagger, and motion/react
// drives that opacity from JS rather than the Web Animations API, so a scan can land on a half-opaque
// card and axe reports the blended colour as a contrast violation the settled page does not have.
// Under prefers-reduced-motion the components skip the entrance animation entirely (useReducedMotion
// in listing-card.tsx), which removes the race instead of racing it. Colours are unaffected.
test.use({ reducedMotion: "reduce" });

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];
// Rules to disable. Only add "color-contrast" here if it produces false positives on OKLCH colors.
const DISABLED_RULES: string[] = [];

const PUBLIC_ROUTES = ["/welcome", "/sign-in", "/sign-up"];
const APP_ROUTES = [
  "/home",
  "/sell",
  "/sell/upload",
  "/inventory",
  "/listings",
  "/offers",
  "/connections",
  "/insights",
  "/automations",
  "/copilot",
  "/settings",
  "/help",
  "/notifications",
  "/onboarding",
];

type Violation = {
  id: string;
  impact: string | null | undefined;
  help: string;
  helpUrl: string;
  nodes: { html: string; target: unknown[]; failureSummary?: string }[];
};

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  // Main heading (h1) of the page; some routes render it slightly after hydration.
  await page.locator("h1").first().waitFor({ state: "attached", timeout: 30_000 }).catch(() => {});

  // Any remaining CSS entrance animations (the reduced-motion path still does a quick fade) must
  // finish before axe reads colours, for the same reason as the reducedMotion setting above.
  await page
    .waitForFunction(
      () =>
        document
          .getAnimations()
          // Looping decoration (shimmer) never finishes; only wait on the finite ones.
          .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
          .every((a) => a.playState === "finished" || a.playState === "idle"),
      undefined,
      { timeout: 10_000 },
    )
    .catch(() => {});
  await page.waitForTimeout(250);
}

async function scan(page: Page, label: string, testInfo: TestInfo) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).disableRules(DISABLED_RULES).analyze();
  const violations = results.violations as Violation[];
  const counts: Record<string, number> = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const v of violations) counts[v.impact ?? "minor"] = (counts[v.impact ?? "minor"] ?? 0) + 1;

  const trimmed = violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    helpUrl: v.helpUrl,
    nodes: v.nodes.map((n) => ({ html: n.html.slice(0, 300), target: n.target, failureSummary: n.failureSummary })),
  }));
  await testInfo.attach(`axe-${label.replace(/[^\w-]+/g, "_")}.json`, {
    body: JSON.stringify({ url: page.url(), counts, violations: trimmed }, null, 2),
    contentType: "application/json",
  });

  console.log(`[a11y] ${label} (${page.url()}) -> critical=${counts.critical} serious=${counts.serious} moderate=${counts.moderate} minor=${counts.minor}`);
  for (const v of trimmed) {
    const sev = v.impact ?? "minor";
    const tag = sev === "serious" || sev === "critical" ? "FAIL" : "warn";
    console.log(`  [${tag}] ${v.id} (${sev}) x${v.nodes.length}: ${v.help} — ${v.helpUrl}`);
    for (const n of v.nodes.slice(0, 5)) console.log(`      ${n.html.slice(0, 200)}`);
  }

  const blocking = trimmed.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect.soft(blocking, `${label}: serious/critical axe violations\n${JSON.stringify(blocking, null, 2)}`).toEqual([]);
  return trimmed;
}

test.describe("accessibility (axe-core)", () => {
  test.describe("public routes (signed out)", () => {
    test.use({ storageState: { cookies: [], origins: [] } });
    for (const route of PUBLIC_ROUTES) {
      test(`axe: ${route}`, async ({ page }, testInfo) => {
        await page.goto(route, { waitUntil: "networkidle" });
        if (route.startsWith("/sign-")) await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 60_000 });
        await settle(page);
        await scan(page, route, testInfo);
      });
    }
  });

  test.describe("app routes (signed in)", () => {
    test.beforeEach(async ({ page }) => {
      // Re-sign-in if the stored session has expired.
      await page.goto("/home", { waitUntil: "networkidle" });
      if (/\/sign-in/.test(page.url())) {
        await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 60_000 });
        await page.getByLabel("Email").fill("demo@clover.local");
        await page.getByLabel("Password").fill("clover-demo-2026");
        await page.getByRole("button", { name: /sign in/i }).click();
        await page.waitForURL((u) => !/\/sign-in/.test(u.pathname), { timeout: 60_000 });
      }
    });

    for (const route of APP_ROUTES) {
      test(`axe: ${route}`, async ({ page }, testInfo) => {
        await page.goto(route, { waitUntil: "networkidle" });
        await settle(page);
        await scan(page, route, testInfo);
      });
    }

    test("axe: first item page and inventory quick-edit sheet", async ({ page }, testInfo) => {
      await page.goto("/inventory", { waitUntil: "networkidle" });
      await settle(page);

      // Item cards are <article tabindex> elements; clicking one opens the quick-edit sheet (a dialog)
      // which links to the full item page.
      const card = page.locator("article[tabindex]").first();
      await card.waitFor({ timeout: 30_000 });
      await card.click();
      const dialog = page.getByRole("dialog").first();
      await dialog.waitFor({ timeout: 15_000 });
      const href = await dialog.locator('a[href^="/items/"]').first().getAttribute("href", { timeout: 15_000 });
      expect(href, "quick-edit sheet should link to the item page").toBeTruthy();
      const itemPath = href!.replace(/[#?].*$/, "");

      // Optional: open the sheet's "More actions" menu too, then scan with the dialog open.
      const more = dialog.getByRole("button", { name: /more actions/i }).first();
      if (await more.isVisible().catch(() => false)) {
        await more.click();
        await page.waitForTimeout(400);
      }
      await scan(page, "/inventory (quick-edit sheet open)", testInfo);
      await page.keyboard.press("Escape");

      await page.goto(itemPath, { waitUntil: "networkidle" });
      await settle(page);
      await scan(page, itemPath, testInfo);
    });
  });
});
