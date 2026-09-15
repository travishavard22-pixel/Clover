import type { registerJobHandler } from "../runner";

/** Placeholder until the feature module lands. Replaced in the feature build. */
export function register(r: typeof registerJobHandler) {
  r("RUN_AUTOMATIONS", async (ctx) => {
    await ctx.log("Handler for RUN_AUTOMATIONS not implemented yet");
    throw new Error("RUN_AUTOMATIONS handler not implemented");
  });
}
