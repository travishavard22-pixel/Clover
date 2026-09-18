/**
 * Generates every icon Clover ships — web, store, desktop and phone — from the shared clover
 * geometry in src/components/brand/clover.ts.
 *
 * Run with `pnpm icons`. Two kinds of file come out of it:
 *
 * - **Finished icons** in `public/icons/`, used directly by the web app and the store listings.
 * - **Masters** for the platform tooling: `apps/desktop/app-icon.png` for `tauri icon`, and
 *   `apps/mobile/assets/*.png` for `@capacitor/assets`. Those two CLIs own the awkward formats
 *   (`.icns`, `.ico`, Android's density ladder), so this script feeds them rather than competing
 *   with them. `docs/runbooks/native-apps.md` has the commands.
 *
 * Everything is drawn from one geometry module so the mark cannot drift between surfaces — the
 * paths used to be duplicated per output, and duplicated logos diverge.
 *
 * Colours are converted from the OKLCH brand tokens rather than hand-picked hex, so the icons stay
 * the same green as the app. `sharp`'s SVG renderer does not accept oklch(), hence the conversion.
 */
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { CLOVER_SCALE, CLOVER_SPLASH_FRACTION, cloverLeaves, cloverScaled } from "../src/components/brand/clover";

/** OKLCH → sRGB hex. Values mirror src/styles/tokens.css. */
function oklch(L: number, C: number, hDeg: number): string {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const [l, m, s] = [l_ ** 3, m_ ** 3, s_ ** 3];
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const channel = (x: number) => {
    const v = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(Math.max(x, 0), 1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${linear.map(channel).join("")}`;
}

const GREEN_MID = oklch(0.72, 0.11, 148); // --green-3
const ACCENT = oklch(0.52, 0.13, 152); // --green-4, the app's accent
const GREEN_DEEP = oklch(0.32, 0.08, 152); // --green-6
const LUCKY = oklch(0.9, 0.06, 152); // --green-2
const CREAM = oklch(0.975, 0.005, 90); // --n-1, the app's light background
const INK = oklch(0.19, 0.01, 120); // --surface-base in dark mode

/** The mark is drawn in a 64-unit square whatever the output size; sharp rasterises the rest. */
const BOX = 64;

function svg(size: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${BOX} ${BOX}">${body}</svg>`;
}

/** The green gradient every square tile sits on. A flat fill looks flat beside other store icons. */
const GRADIENT = [
  `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">`,
  `<stop offset="0" stop-color="${GREEN_MID}"/><stop offset="1" stop-color="${GREEN_DEEP}"/>`,
  `</linearGradient></defs>`,
].join("");

/** A full brand tile: the gradient square with the two-tone clover on it. */
function tile(size: number, { radius = 0, scale = CLOVER_SCALE.tile }: { radius?: number; scale?: number } = {}): string {
  return svg(
    size,
    [
      GRADIENT,
      `<rect width="${BOX}" height="${BOX}" rx="${radius}" fill="url(#g)"/>`,
      `<g fill="${CREAM}">${cloverLeaves(scale, BOX, { attrs: `fill="${LUCKY}"` })}</g>`,
    ].join(""),
  );
}

/**
 * The mark alone, with whatever sits behind it left transparent or filled by the caller.
 *
 * `fraction` shrinks the assembled mark rather than its leaves — see `cloverScaled`; lowering the
 * leaf scale instead would widen the clefts until the leaves came apart.
 */
function mark(
  size: number,
  { scale = CLOVER_SCALE.tile, fraction, fill, lucky, background }: { scale?: number; fraction?: number; fill: string; lucky: string; background?: string },
): string {
  const leaves = `<g fill="${fill}">${cloverLeaves(scale, BOX, { attrs: lucky })}</g>`;
  return svg(
    size,
    [
      background ? `<rect width="${BOX}" height="${BOX}" fill="${background}"/>` : "",
      fraction === undefined ? leaves : cloverScaled(fraction, leaves, scale, BOX),
    ].join(""),
  );
}

const png = (markup: string) => sharp(Buffer.from(markup)).png().toBuffer();

async function write(path: string, markup: string, size: number): Promise<string> {
  const url = new URL(`../${path}`, import.meta.url);
  mkdirSync(new URL(".", url), { recursive: true });
  writeFileSync(url, await png(markup));
  return `${path} (${size}px)`;
}

const written: string[] = [];

// ── Web and store icons ───────────────────────────────────────────────────────────────────────
for (const { name, size, radius, scale } of [
  { name: "icon-192.png", size: 192, radius: 42 },
  { name: "icon-512.png", size: 512, radius: 112 },
  // iOS applies its own mask, so this one ships square — a pre-rounded icon gets double-rounded.
  { name: "apple-touch-icon.png", size: 180, radius: 0 },
  // Android may crop a maskable icon to a circle of 80% diameter, so the mark sits further in.
  { name: "icon-maskable-512.png", size: 512, radius: 0, scale: CLOVER_SCALE.maskable },
  // The master the store listings are generated from.
  { name: "icon-1024.png", size: 1024, radius: 0 },
] as Array<{ name: string; size: number; radius: number; scale?: number }>) {
  written.push(await write(`public/icons/${name}`, tile(size, { radius, scale }), size));
}
writeFileSync(new URL("../public/icons/icon.svg", import.meta.url), tile(BOX, { radius: 14 }));
written.push("public/icons/icon.svg");

// ── Desktop master ────────────────────────────────────────────────────────────────────────────
// `tauri icon` resizes this one square into the whole bundle, .icns and .ico included.
written.push(await write("apps/desktop/app-icon.png", tile(1024), 1024));

// ── Phone masters ─────────────────────────────────────────────────────────────────────────────
// `@capacitor/assets` reads these exact filenames out of apps/mobile/assets. Icons must be at
// least 1024px and splashes at least 2732px; the splash is square because the tool centre-crops
// it to every device aspect ratio, which is also why the mark is kept well away from the edges.
// The launch screens pick the lucky leaf out with a real second green rather than reduced opacity:
// on the dark screen a 55%-opacity leaf turns grey against near-black instead of reading as green.
// Each screen uses the accent its own theme uses in the app — --green-4 on cream, --green-3 on ink.
const SPLASH = 2732;
written.push(await write("apps/mobile/assets/icon-only.png", tile(1024), 1024));
written.push(
  await write(
    "apps/mobile/assets/icon-foreground.png",
    mark(1024, { scale: CLOVER_SCALE.adaptive, fill: CREAM, lucky: `fill="${LUCKY}"` }),
    1024,
  ),
);
written.push(await write("apps/mobile/assets/icon-background.png", svg(1024, `${GRADIENT}<rect width="${BOX}" height="${BOX}" fill="url(#g)"/>`), 1024));
written.push(
  await write(
    "apps/mobile/assets/splash.png",
    mark(SPLASH, { fraction: CLOVER_SPLASH_FRACTION, fill: ACCENT, lucky: `fill="${GREEN_MID}"`, background: CREAM }),
    SPLASH,
  ),
);
written.push(
  await write(
    "apps/mobile/assets/splash-dark.png",
    mark(SPLASH, { fraction: CLOVER_SPLASH_FRACTION, fill: GREEN_MID, lucky: `fill="${LUCKY}"`, background: INK }),
    SPLASH,
  ),
);

console.log(`icons written:\n  ${written.join("\n  ")}`);
