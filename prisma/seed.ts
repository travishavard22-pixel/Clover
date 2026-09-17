// Seed entry point (`pnpm db:seed`). Loads .env for tsx, then runs the demo seed.
//
// Runs on every container start (see the Dockerfile CMD and railway.json startCommand), so it has
// two guards. It refuses to run unless demo mode is on, because the demo catalogue must never land
// in a real seller's database; and seedDemoAccount() itself returns early when the account already
// has items, so only the first boot does real work (~30s) and later boots cost a single count query.
import { loadDotEnv } from "../src/lib/env-file";

loadDotEnv();

const { capabilities } = await import("../src/lib/env");
if (!capabilities.demoMode) {
  console.log("Demo mode is off (CLOVER_DEMO_MODE is not set) — skipping the demo seed.");
  process.exit(0);
}

const { seedDemoAccount } = await import("../src/lib/demo/seed");
const r = await seedDemoAccount();
console.log(`Seeded demo account ${r.email} with ${r.items} items.`);
process.exit(0);
