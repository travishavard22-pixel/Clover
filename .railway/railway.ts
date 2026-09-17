import { defineRailway, github, postgres, preserve, project, service } from "railway/iac";

/**
 * Railway Infrastructure as Code for the hosted Clover deployment.
 *
 * This replaces railway.json / railway.worker.json / railway.automations.json. Config as Code is
 * deprecated: Railway refuses to attach it to new services, stops reading existing files on
 * 2026-12-01, and in this project it was never read at all — every service ran on the Dockerfile's
 * CMD plus dashboard defaults, so the healthcheck and restart policy those files declared were
 * silently inactive.
 *
 * Two things this file deliberately does not own:
 *
 * - The cron schedule, restart policy and Dockerfile path. The IaC DSL does not document fields for
 *   them, so they stay service settings in Railway (automations runs `0 9 * * *` with restart NEVER;
 *   web restarts ON_FAILURE up to 5 times). Do not guess field names here to move them.
 * - Secret values. Everything the CLI cannot read is `preserve()`, which keeps whatever Railway
 *   already holds. Only non-secret settings are pinned literally.
 *
 * Every variable each service currently has is listed, because an apply treats an omitted variable
 * as a deletion. Railway-injected RAILWAY_* variables are excluded — the platform supplies those.
 *
 * Apply with the CLI, never blind:
 *
 *   railway link
 *   railway config plan     # review: it must not show deletes of services, volumes or variables
 *   railway config apply
 *
 * `railway config pull --force` regenerates this file from live state if the two ever diverge.
 */

const REPO = "travishavard22-pixel/Clover";

// Shared by web, worker and automations: the same database, bucket and crypto material.
const sharedEnv = (db: ReturnType<typeof postgres>) => ({
  DATABASE_URL: db.env.DATABASE_URL,
  APP_URL: preserve(),
  BETTER_AUTH_SECRET: preserve(),
  CLOVER_ENCRYPTION_KEYS: preserve(),
  CLOVER_DEMO_MODE: preserve(),
  STORAGE_DRIVER: preserve(),
  // Pinned: this was set to the Cloudflare token's label instead of the bucket name, which failed
  // every photo write with InvalidBucketName until it was corrected.
  S3_BUCKET: "clover-photos",
  S3_ENDPOINT: preserve(),
  S3_REGION: preserve(),
  S3_ACCESS_KEY_ID: preserve(),
  S3_SECRET_ACCESS_KEY: preserve(),
});

export default defineRailway(() => {
  const db = postgres("Postgres");

  const web = service("web", {
    source: github(REPO, { branch: "main" }),
    healthcheck: "/api/health",
    healthcheckTimeout: 300,
    env: {
      ...sharedEnv(db),
      CLOVER_INLINE_WORKER: preserve(),
      CLOVER_MODEL_CHECK: preserve(),
      CLOVER_MODEL_COPILOT: preserve(),
      CLOVER_MODEL_IDENTIFY: preserve(),
      CLOVER_MODEL_WRITE: preserve(),
      STORAGE_LOCAL_DIR: preserve(),
      STUDIO_SEGMENTATION_PROVIDER: preserve(),
      EBAY_ENV: preserve(),
      APNS_BUNDLE_ID: preserve(),
      APNS_ENV: preserve(),
    },
  });

  // Job queue only. It must not run the Dockerfile's CMD: that seeds the demo catalogue, and a
  // second seeder racing web's is what produced a Photo_itemId_fkey failure in production.
  const worker = service("worker", {
    source: github(REPO, { branch: "main" }),
    start: "pnpm exec tsx scripts/worker.ts",
    env: sharedEnv(db),
  });

  // Nightly recommendations. Runs on the cron schedule held in the service settings, then exits.
  const automations = service("automations", {
    source: github(REPO, { branch: "main" }),
    start:
      "pnpm exec tsx -e \"import('./src/lib/automations').then((m) => m.enqueueAutomationsForAllUsers()).then(() => process.exit(0))\"",
    env: sharedEnv(db),
  });

  return project("unique-emotion", {
    resources: [db, web, worker, automations],
  });
});
