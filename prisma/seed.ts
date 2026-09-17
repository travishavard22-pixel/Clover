// Seed entry point (`pnpm db:seed`). Loads .env for tsx, then runs the demo seed.
//
// Runs on every container start (see the Dockerfile CMD and railway.json startCommand), so it has
// two guards. It refuses to run unless demo mode is on, because the demo catalogue must never land
// in a real seller's database; and seedDemoAccount() returns early once the account is completely
// seeded, so only the first boot does real work (~30s) and later boots cost two count queries.
// A run that fails partway leaves an incomplete account, which the next start rebuilds.
import { loadDotEnv } from "../src/lib/env-file";

loadDotEnv();

const { capabilities } = await import("../src/lib/env");
if (!capabilities.demoMode) {
  console.log("Demo mode is off (CLOVER_DEMO_MODE is not set) — skipping the demo seed.");
  process.exit(0);
}

const { seedDemoAccount } = await import("../src/lib/demo/seed");
try {
  const r = await seedDemoAccount();
  console.log(`Seeded demo account ${r.email} with ${r.items} items.`);
  process.exit(0);
} catch (err) {
  // The start command keeps going after a failure here, so this message is the only trace of why
  // the catalogue is missing. Name the likely cause: the seed writes 48 photos through the storage
  // driver, so a misconfigured bucket fails on the first one, right after the first item is created.
  console.error("[demo-seed] FAILED — the demo catalogue was not built. The next start will retry.");
  console.error("[demo-seed] Photo writes go through STORAGE_DRIVER; check S3_BUCKET, S3_ENDPOINT and the R2 keys.");
  console.error(err);
  process.exit(1);
}
