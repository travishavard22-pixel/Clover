import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  // One worker: the suite drives a single dev server that compiles routes on demand.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    // In sandboxed environments Chromium is preinstalled; point at it instead of downloading.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : undefined,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `pnpm exec next dev -p ${port}`,
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { ...process.env, CLOVER_DEMO_MODE: "1", PORT: String(port) },
  },
  projects: [
    // Signs in as the seeded demo seller once and shares the session with the flow specs.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "desktop", use: { ...devices["Desktop Chrome"], storageState: "test-results/.auth/demo.json" }, dependencies: ["setup"] },
    { name: "mobile", use: { ...devices["Pixel 7"], storageState: "test-results/.auth/demo.json" }, dependencies: ["setup"] },
  ],
});
