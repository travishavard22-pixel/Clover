// Seed entry point (`pnpm db:seed`). Loads .env for tsx, then runs the demo seed.
import { readFileSync } from "node:fs";

try {
  for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!;
  }
} catch {
  // .env absent — rely on the environment
}

const { seedDemoAccount } = await import("../src/lib/demo/seed");
const r = await seedDemoAccount();
console.log(`Seeded demo account ${r.email} with ${r.items} items.`);
process.exit(0);
