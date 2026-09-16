/**
 * Next.js instrumentation hook. Starts the in-process job worker for single-instance
 * deployments and development. Set CLOVER_INLINE_WORKER=0 when running `pnpm worker` separately.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.CLOVER_INLINE_WORKER === "0") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { registerAllHandlers, startWorker } = await import("./lib/jobs");
  registerAllHandlers();
  const g = globalThis as unknown as { __cloverWorker?: { id: string } };
  if (!g.__cloverWorker) g.__cloverWorker = startWorker({ concurrency: 2 });
}
