// Dedicated job worker process: `pnpm worker`
import { loadDotEnv } from "../src/lib/env-file";

loadDotEnv();
const { registerAllHandlers, startWorker, startScheduler } = await import("../src/lib/jobs");

registerAllHandlers();
const handle = startWorker({ concurrency: Number(process.env.WORKER_CONCURRENCY ?? 3) });
// The heartbeat that pulls marketplaces and sweeps automations. Safe to run in every worker: the
// due check takes a Postgres advisory lock, so only one of them enqueues.
const scheduler = startScheduler();

const shutdown = async () => {
  console.log("[jobs] shutting down…");
  scheduler.stop();
  await handle.stop();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
