/**
 * Builds the App Store and Google Play listing assets from the running app.
 *
 * Run with `pnpm store:screenshots` against a demo-mode server (see
 * docs/runbooks/native-apps.md). Two phases:
 *
 * 1. **Capture.** Playwright signs in as the seeded demo seller and photographs real screens at
 *    each store's device size. Nothing is mocked or redrawn: what the stores show is what the app
 *    renders, which is both Apple's rule and the only honest thing to publish.
 * 2. **Frame.** Each capture is composed into a store-sized canvas with a caption, on the brand
 *    gradient, in the app's own typography — the frame page links the running app's stylesheets,
 *    so the headline font and the greens cannot drift from the product.
 *
 * Output lands in artifacts/store/ (git-ignored: these are build products of the app, and they are
 * regenerated per release rather than reviewed as source).
 */
import { chromium, type Browser, type Page } from "@playwright/test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const BASE = process.env.SCREENSHOT_BASE_URL ?? "http://127.0.0.1:3100";
const DEMO = {
  email: process.env.DEMO_EMAIL ?? "demo@clover.local",
  password: process.env.DEMO_PASSWORD ?? "clover-demo-2026",
};
const OUT = "artifacts/store";

/** The two layouts the app has. Captured separately because the tablet is not a stretched phone. */
const DEVICES = {
  // Playwright's own context shape: a bare width/height at the top level is silently ignored and
  // you get the default 1280×720 desktop viewport, which is the wrong layout entirely.
  phone: { viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  tablet: { viewport: { width: 1032, height: 1376 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
} as const;

type Shot = {
  id: string;
  head: string;
  sub: string;
  /** Drives the app to the screen the way a person would, so the capture is a real state. */
  go: (page: Page) => Promise<void>;
};

const settle = async (page: Page, ms = 1200) => {
  await page.waitForLoadState("networkidle").catch(() => {});
  // Wait for the images on screen, then a beat for the entrance animations to finish.
  await page
    .evaluate(() => Promise.all(Array.from(document.images, (i) => (i.complete ? null : i.decode().catch(() => null)))))
    .catch(() => {});
  await page.waitForTimeout(ms);
};

const visit = (route: string) => async (page: Page) => {
  await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await settle(page);
};

const SHOTS: Shot[] = [
  {
    id: "01-home",
    head: "Your day, already sorted",
    sub: "Offers to answer, listings that need a nudge, money in and out — first, not buried.",
    go: visit("/home"),
  },
  {
    id: "02-sell",
    head: "Photograph it.\nIt's for sale.",
    sub: "Two to four photos is plenty. Clover takes it from there.",
    go: visit("/sell"),
  },
  {
    id: "03-item",
    head: "It knows what it is",
    sub: "Identified from the photos, priced against what really sold, with the evidence attached.",
    go: async (page) => {
      await page.goto(`${BASE}/inventory`, { waitUntil: "domcontentloaded", timeout: 120_000 });
      await settle(page, 800);
      await page.getByRole("article").first().click({ timeout: 30_000 });
      const link = page.locator('a[href^="/items/"]').first();
      await link.waitFor({ timeout: 30_000 });
      await link.click();
      await page.waitForURL(/\/items\//, { timeout: 60_000 });
      await settle(page, 1600);
    },
  },
  {
    id: "04-offers",
    head: "Answer offers with the maths done",
    sub: "Fees, shipping and your floor, worked out before you accept, counter or decline.",
    go: visit("/offers"),
  },
  {
    id: "05-listings",
    head: "Every marketplace, one shelf",
    sub: "What's live, what sold, what needs you — across every place you post.",
    go: visit("/listings"),
  },
  {
    id: "06-connections",
    head: "Honest about every limit",
    sub: "Official APIs where they exist. Assisted posting where they don't. Never a hidden password.",
    go: visit("/connections"),
  },
];

/** The store canvases. Apple takes one iPhone set and one iPad set; Play takes phone screenshots. */
const TARGETS = [
  { dir: "appstore-iphone-6.9", width: 1290, height: 2796, from: "phone" as const, headPx: 88, subPx: 40 },
  { dir: "appstore-ipad-13", width: 2064, height: 2752, from: "tablet" as const, headPx: 108, subPx: 48 },
  { dir: "play-phone", width: 1080, height: 1920, from: "phone" as const, headPx: 66, subPx: 31 },
];

async function signIn(page: Page) {
  await page.goto(`${BASE}/sign-in`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 90_000 });
  await page.getByLabel("Email").fill(DEMO.email);
  await page.getByLabel("Password").fill(DEMO.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/(home|onboarding)/, { timeout: 90_000 });
}

/** The app's own stylesheet URLs, so the frames use the product's fonts and colour tokens. */
async function appStylesheets(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'), (l) => l.href),
  );
}

async function capture(browser: Browser, device: keyof typeof DEVICES) {
  const ctx = await browser.newContext({ ...DEVICES[device], baseURL: BASE, colorScheme: "light", reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await signIn(page);
  const css = await appStylesheets(page);
  if (!css.length) throw new Error("no app stylesheets found: the frames would lose the brand fonts and colours");
  const shots = new Map<string, Buffer>();
  for (const shot of SHOTS) {
    await shot.go(page);
    shots.set(shot.id, await page.screenshot({ type: "png" }));
    console.log(`  captured ${device}/${shot.id}`);
  }
  await ctx.close();
  return { shots, css };
}

/** The caption-over-device composition, drawn at the exact pixel size the store wants. */
function frameHtml(o: {
  css: string[];
  head: string;
  sub: string;
  shot: string;
  width: number;
  height: number;
  headPx: number;
  subPx: number;
}): string {
  const pad = Math.round(o.width * 0.075);
  const radius = Math.round(o.width * 0.042);
  return `<!doctype html><html data-theme="light"><head><meta charset="utf-8">
${o.css.map((href) => `<link rel="stylesheet" href="${href}">`).join("\n")}
<style>
  html, body { margin: 0; padding: 0; width: ${o.width}px; height: ${o.height}px; overflow: hidden; }
  .sheet {
    width: ${o.width}px; height: ${o.height}px; box-sizing: border-box;
    padding: ${pad}px ${pad}px 0;
    display: flex; flex-direction: column; align-items: center; text-align: center;
    background: linear-gradient(160deg, var(--green-3) 0%, var(--green-5) 48%, var(--green-6) 100%);
  }
  h1 {
    margin: 0; color: var(--n-1); font-family: var(--font-serif); font-weight: 400;
    font-size: ${o.headPx}px; line-height: 1.02; letter-spacing: -0.02em; white-space: pre-line;
  }
  p {
    margin: ${Math.round(o.headPx * 0.34)}px auto 0; max-width: ${Math.round(o.width * 0.8)}px;
    color: color-mix(in oklch, var(--n-1) 88%, var(--green-3));
    font-family: var(--font-sans); font-size: ${o.subPx}px; line-height: 1.34; font-weight: 400;
  }
  /* The device: the capture with a hairline edge and a shadow, cropped at the bottom so the frame
     reads as a phone standing in the canvas rather than a floating rectangle. */
  .device {
    margin-top: ${Math.round(o.height * 0.045)}px; width: ${Math.round(o.width * 0.78)}px; flex: 1;
    border-radius: ${radius}px ${radius}px 0 0; overflow: hidden;
    background: var(--n-0);
    box-shadow: 0 ${Math.round(o.width * 0.006)}px ${Math.round(o.width * 0.02)}px rgba(0,0,0,.18),
                0 ${Math.round(o.width * 0.03)}px ${Math.round(o.width * 0.08)}px rgba(0,0,0,.28);
    outline: ${Math.max(2, Math.round(o.width * 0.002))}px solid rgba(255,255,255,.34);
    outline-offset: ${-Math.max(2, Math.round(o.width * 0.002))}px;
  }
  .device img { display: block; width: 100%; }
</style></head>
<body><div class="sheet">
  <h1>${o.head.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</h1>
  <p>${o.sub.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>
  <div class="device"><img src="data:image/png;base64,${o.shot}"></div>
</div></body></html>`;
}

/** Stores reject alpha channels, so every asset is flattened to 24-bit RGB on the way out. */
async function writeOpaque(file: string, png: Buffer) {
  const out = await sharp(png).flatten({ background: "#0f5132" }).removeAlpha().png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(file, out);
  const meta = await sharp(out).metadata();
  if (meta.channels !== 3) throw new Error(`${file}: expected 3 channels, got ${meta.channels}`);
  return meta;
}

/** Play's 1024×500 feature graphic. Not a screenshot — Play asks for a graphic, and shows it cropped. */
function featureHtml(css: string[]): string {
  return `<!doctype html><html data-theme="light"><head><meta charset="utf-8">
${css.map((href) => `<link rel="stylesheet" href="${href}">`).join("\n")}
<style>
  html, body { margin: 0; width: 1024px; height: 500px; overflow: hidden; }
  .g {
    width: 1024px; height: 500px; display: flex; align-items: center; justify-content: center; gap: 34px;
    background: linear-gradient(140deg, var(--green-3) 0%, var(--green-5) 52%, var(--green-6) 100%);
  }
  /* Everything stays inside the middle so Play's own cropping cannot cut the wordmark. */
  .lockup { display: flex; align-items: center; gap: 26px; }
  .name { font-family: var(--font-sans); font-weight: 600; font-size: 104px; letter-spacing: -0.045em; color: var(--n-1); line-height: 1; }
  .tag { margin-top: 18px; font-family: var(--font-serif); font-size: 40px; color: color-mix(in oklch, var(--n-1) 86%, var(--green-3)); }
  .col { display: flex; flex-direction: column; align-items: flex-start; }
</style></head>
<body><div class="g"><div class="lockup">
  <svg width="132" height="132" viewBox="0 0 64 64" fill="var(--n-1)" aria-hidden="true">__LEAVES__</svg>
  <div class="col"><div class="name">clover</div><div class="tag">Photograph it. It's for sale.</div></div>
</div></div></body></html>`;
}

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
  const captured: Partial<Record<keyof typeof DEVICES, Awaited<ReturnType<typeof capture>>>> = {};
  for (const device of Object.keys(DEVICES) as Array<keyof typeof DEVICES>) {
    console.log(`capturing ${device}…`);
    captured[device] = await capture(browser, device);
  }

  const css = captured.phone!.css;
  const page = await (await browser.newContext({ viewport: { width: 1290, height: 2796 }, deviceScaleFactor: 1 })).newPage();
  const written: string[] = [];

  for (const t of TARGETS) {
    mkdirSync(`${OUT}/${t.dir}`, { recursive: true });
    for (const shot of SHOTS) {
      const png = captured[t.from]!.shots.get(shot.id)!;
      await page.setViewportSize({ width: t.width, height: t.height });
      await page.setContent(
        frameHtml({ css, head: shot.head, sub: shot.sub, shot: png.toString("base64"), width: t.width, height: t.height, headPx: t.headPx, subPx: t.subPx }),
        { waitUntil: "networkidle" },
      );
      await page.evaluate(() => document.fonts.ready);
      const file = `${OUT}/${t.dir}/${shot.id}.png`;
      const meta = await writeOpaque(file, await page.screenshot({ type: "png" }));
      written.push(`${file} ${meta.width}×${meta.height}`);
    }
  }

  // The Play feature graphic, drawn from the same clover geometry as the app icon.
  const { CLOVER_SCALE, cloverLeaves, CLOVER_SPLASH_FRACTION, cloverFit } = await import("../src/components/brand/clover");
  const k = cloverFit(CLOVER_SPLASH_FRACTION * 4.2);
  const leaves = `<g transform="translate(32 32) scale(${k}) translate(-32 -32)">${cloverLeaves(CLOVER_SCALE.tile, 64, { attrs: 'fill-opacity="0.55"' })}</g>`;
  mkdirSync(`${OUT}/play-graphics`, { recursive: true });
  await page.setViewportSize({ width: 1024, height: 500 });
  await page.setContent(featureHtml(css).replace("__LEAVES__", leaves), { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const feature = `${OUT}/play-graphics/feature-graphic-1024x500.png`;
  const fmeta = await writeOpaque(feature, await page.screenshot({ type: "png" }));
  written.push(`${feature} ${fmeta.width}×${fmeta.height}`);

  await browser.close();
  console.log(`\nstore assets written:\n  ${written.join("\n  ")}`);
}

main();
