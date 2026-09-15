// Seed entry point. Real seeding lives in src/lib/demo/seed.ts so it can be reused by tests.
import { seedDemoAccount } from "../src/lib/demo/seed";

seedDemoAccount()
  .then((r) => {
    console.log(`Seeded demo account ${r.email} with ${r.items} items.`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
