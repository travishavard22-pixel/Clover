// Vitest setup. Loads .env for integration tests (unit tests must not touch the database).
import { readFileSync } from "node:fs";

try {
  const raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!;
  }
} catch {
  // no .env — CI provides variables directly
}
// Integration tests run against a dedicated database when provided.
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.CLOVER_DEMO_MODE = process.env.CLOVER_DEMO_MODE ?? "1";
