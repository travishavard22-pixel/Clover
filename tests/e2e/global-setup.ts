import { execFileSync } from "node:child_process";

/**
 * Seeds the demo account once per e2e run so specs have realistic, deterministic data.
 * Runs the seed through tsx in a child process because the app's server modules resolve
 * Next.js internals that Playwright's own loader cannot.
 */
export default async function globalSetup() {
  const out = execFileSync("pnpm", ["exec", "tsx", "prisma/seed.ts"], { env: { ...process.env, CLOVER_DEMO_MODE: "1" }, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  console.log(`[e2e] ${out.trim().split("\n").pop()}`);
}
