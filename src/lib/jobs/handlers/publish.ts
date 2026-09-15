import type { registerJobHandler } from "../runner";

/** Placeholder until the feature module lands. Replaced in the feature build. */
export function register(r: typeof registerJobHandler) {
  r("PUBLISH", async (ctx) => {
    await ctx.log("Handler for PUBLISH not implemented yet");
    throw new Error("PUBLISH handler not implemented");
  });
}
