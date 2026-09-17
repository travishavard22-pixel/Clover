import { expect, test } from "@playwright/test";

/**
 * No page may be wider than the phone it is read on.
 *
 * The dashboard used to pan sideways by ~880px. The cause was a grid that declared its columns
 * only at `lg:`: with no base template the single mobile track is sized `auto`, whose floor is the
 * content's min-content width, so the recent-items photo scroller (8 × 144px of tiles) stretched
 * the whole column to 1236px and every card inside it with it. `grid-cols-1` gives the track a
 * `minmax(0, 1fr)` floor instead, which is the thing this test protects — it is a one-token
 * omission that is invisible on a desktop and ruins the page on a phone.
 *
 * Deliberate horizontal scrollers (`overflow-x-auto`) are fine; what is checked is the document.
 */
const ROUTES = [
  "/welcome",
  "/home",
  "/sell",
  "/sell/upload",
  "/inventory",
  "/listings",
  "/offers",
  "/insights",
  "/automations",
  "/connections",
  "/copilot",
  "/notifications",
  "/settings",
  "/help",
];

for (const width of [320, 390]) {
  // Checked once, at the two widths that matter: 320px is the narrowest phone still in use and
  // 390px is a current iPhone. The spec sets its own viewport, so the desktop project would only
  // repeat the same measurements.
  test(`every page fits a ${width}px viewport`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "Viewport fit is checked in the mobile project only.");
    await page.setViewportSize({ width, height: 900 });
    const offenders: string[] = [];

    for (const route of ROUTES) {
      await page.goto(route, { waitUntil: "networkidle" });
      const report = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const overflow = document.documentElement.scrollWidth - vw;
        if (overflow <= 1) return null;
        // Name the innermost element sticking out, so a failure points at the culprit rather than
        // at the body. Anything inside a scroll container is allowed to extend past the edge.
        const wide: Element[] = [];
        for (const el of document.querySelectorAll("body *")) {
          const style = getComputedStyle(el);
          if (style.position === "fixed") continue;
          if (el.closest("[style*='overflow'], .overflow-x-auto")) continue;
          if (el.getBoundingClientRect().right - vw > 1) wide.push(el);
        }
        const innermost = wide.find((el) => !wide.some((other) => other !== el && el.contains(other)));
        const describe = (el: Element | undefined) => (el ? `<${el.tagName.toLowerCase()} class="${el.className}">` : "unknown element");
        return { overflow, culprit: describe(innermost) };
      });
      if (report) offenders.push(`${route}: ${report.overflow}px too wide — ${report.culprit}`);
    }

    expect(offenders, `Pages that pan sideways at ${width}px:\n${offenders.join("\n")}`).toEqual([]);
  });
}
