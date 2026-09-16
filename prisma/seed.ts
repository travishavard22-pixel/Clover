// Seed entry point (`pnpm db:seed`). Loads .env for tsx, then runs the demo seed.
import { loadDotEnv } from "../src/lib/env-file";

loadDotEnv();

const { seedDemoAccount } = await import("../src/lib/demo/seed");
const r = await seedDemoAccount();
console.log(`Seeded demo account ${r.email} with ${r.items} items.`);
process.exit(0);
