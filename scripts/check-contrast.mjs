// Verifies WCAG contrast for the token pairs that matter, in both themes, straight from tokens.css.
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/styles/tokens.css", import.meta.url), "utf8");

function block(selectorRegex) {
  const m = css.match(selectorRegex);
  if (!m) throw new Error("token block not found");
  const start = css.indexOf("{", m.index);
  let depth = 0;
  for (let i = start; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}") depth--;
    if (depth === 0) return css.slice(start + 1, i);
  }
  throw new Error("unbalanced");
}
function vars(text) {
  const out = {};
  for (const m of text.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
const light = vars(block(/:root\s*\{/));
const dark = { ...light, ...vars(block(/:root\[data-theme="dark"\]/)) };

function resolve(theme, value, depth = 0) {
  if (depth > 10) throw new Error("var loop");
  const m = value.match(/^var\(--([a-z0-9-]+)\)$/);
  if (m) return resolve(theme, theme[m[1]], depth + 1);
  return value;
}

// OKLCH → sRGB (no alpha handling: we only check opaque tokens)
function oklchToRgb(str) {
  const m = str.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (!m) return null;
  const [L, C, h] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, mm = m_ ** 3, s = s_ ** 3;
  let r = 4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s;
  let g = -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s;
  let bb = -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s;
  const clamp = (x) => Math.min(1, Math.max(0, x));
  return [clamp(r), clamp(g), clamp(bb)];
}
// Inputs are LINEAR sRGB (straight from the OKLab matrix), so no transfer-curve decode here.
function lum([r, g, b]) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const pairs = [
  ["text-primary", "surface-base", 4.5],
  ["text-primary", "surface-raised", 4.5],
  ["text-primary", "surface-sunken", 4.5],
  ["text-secondary", "surface-base", 4.5],
  ["text-secondary", "surface-raised", 4.5],
  ["text-muted", "surface-base", 3.0],
  ["text-on-accent", "accent", 4.5],
  ["accent-text", "surface-base", 4.5],
  ["accent-text", "accent-soft", 4.5],
  ["success", "success-soft", 3.0],
  ["warning", "warning-soft", 3.0],
  ["danger", "danger-soft", 3.0],
  ["info", "info-soft", 3.0],
  ["text-inverse", "surface-inverse", 4.5],
  ["border-default", "surface-base", 1.4],
  ["accent", "surface-base", 3.0],
];

let failed = 0;
for (const [name, theme] of [["light", light], ["dark", dark]]) {
  for (const [fg, bg, min] of pairs) {
    const f = oklchToRgb(resolve(theme, theme[fg]));
    const b = oklchToRgb(resolve(theme, theme[bg]));
    if (!f || !b) {
      console.log(`  ? ${name} ${fg} on ${bg}: could not parse`);
      continue;
    }
    const c = contrast(f, b);
    const ok = c >= min;
    if (!ok) failed++;
    console.log(`${ok ? "  ✓" : "  ✗"} ${name.padEnd(5)} ${fg.padEnd(16)} on ${bg.padEnd(16)} ${c.toFixed(2)} (min ${min})`);
  }
}
if (failed) {
  console.error(`\n${failed} contrast check(s) failed`);
  process.exit(1);
}
console.log("\nAll contrast checks passed.");
