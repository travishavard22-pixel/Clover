import { readFileSync } from "node:fs";

/**
 * Loads KEY=value pairs from a .env file into process.env without overriding existing values.
 * Next.js does this itself; standalone scripts (worker, seed, tests) call it explicitly.
 */
export function loadDotEnv(path = new URL("../../.env", import.meta.url)): void {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const rest = m[2]!.trim();
    const quoted = rest.match(/^"((?:[^"\\]|\\.)*)"|^'([^']*)'/);
    const v = quoted ? (quoted[1] ?? quoted[2] ?? "").replace(/\\"/g, '"') : rest.replace(/\s+#.*$/, "").trim();
    if (process.env[m[1]!] === undefined) process.env[m[1]!] = v;
  }
}
