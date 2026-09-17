/**
 * Generates the web and store icons from the shared clover geometry.
 *
 * Run with `pnpm icons`. Replaces the previous generate-icons.mjs, which carried its own copy of
 * the mark's paths — two copies of a logo drift, and the point of a logo is that it does not.
 *
 * Colours are converted from the OKLCH brand tokens rather than hand-picked hex, so the icons stay
 * the same green as the app. `sharp`'s SVG renderer does not accept oklch(), hence the conversion.
 */
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { CLOVER_SCALE, cloverLeaves } from "../src/components/brand/clover";

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
const GREEN_DEEP = oklch(0.32, 0.08, 152); // --green-6
const LUCKY = oklch(0.9, 0.06, 152); // --green-2
const CREAM = oklch(0.975, 0.005, 90); // --n-1

/**
 * One icon tile. The gradient gives the icon presence on a store page, where a flat fill sits
 * flatter than everything around it; the app's own UI mark stays single-colour.
 */
function tile(size: number, { radius = 0, scale = CLOVER_SCALE.tile }: { radius?: number; scale?: number } = {}): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">`,
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">`,
    `<stop offset="0" stop-color="${GREEN_MID}"/><stop offset="1" stop-color="${GREEN_DEEP}"/>`,
    `</linearGradient></defs>`,
    `<rect width="64" height="64" rx="${radius}" fill="url(#g)"/>`,
    `<g fill="${CREAM}">${cloverLeaves(scale, 64, { attrs: `fill="${LUCKY}"` })}</g>`,
    `</svg>`,
  ].join("");
}

const out = (name: string) => new URL(`../public/icons/${name}`, import.meta.url);
mkdirSync(new URL("../public/icons/", import.meta.url), { recursive: true });

const PNGS: Array<{ name: string; size: number; radius: number; scale?: number }> = [
  { name: "icon-192.png", size: 192, radius: 42 },
  { name: "icon-512.png", size: 512, radius: 112 },
  // iOS applies its own mask, so this one ships square — a pre-rounded icon gets double-rounded.
  { name: "apple-touch-icon.png", size: 180, radius: 0 },
  // Android may crop a maskable icon to a circle of 80% diameter, so the mark sits further in.
  { name: "icon-maskable-512.png", size: 512, radius: 0, scale: CLOVER_SCALE.maskable },
  // The master the store listings and the native icon CLIs are generated from.
  { name: "icon-1024.png", size: 1024, radius: 0 },
];

for (const { name, size, radius, scale } of PNGS) {
  const png = await sharp(Buffer.from(tile(size, { radius, scale }))).png().toBuffer();
  writeFileSync(out(name), png);
}
writeFileSync(out("icon.svg"), tile(64, { radius: 14 }));

console.log(`icons written: ${PNGS.map((p) => p.name).join(", ")}, icon.svg`);
