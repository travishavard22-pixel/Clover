// Dedicated job worker process: `pnpm worker`
import { loadDotEnv } from "../src/lib/env-file";

loadDotEnv();
const { registerAllHandlers, startWorker } = await import("../src/lib/jobs");

registerAllHandlers();
const handle = startWorker({ concurrency: Number(process.env.WORKER_CONCURRENCY ?? 3) });

const shutdown = async () => {
  console.log("[jobs] shutting down…");
  await handle.stop();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
