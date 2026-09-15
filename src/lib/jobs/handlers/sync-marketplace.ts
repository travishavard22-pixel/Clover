import type { registerJobHandler } from "../runner";

/** Placeholder until the feature module lands. Replaced in the feature build. */
export function register(r: typeof registerJobHandler) {
  r("SYNC_MARKETPLACE", async (ctx) => {
    await ctx.log("Handler for SYNC_MARKETPLACE not implemented yet");
    throw new Error("SYNC_MARKETPLACE handler not implemented");
  });
}
