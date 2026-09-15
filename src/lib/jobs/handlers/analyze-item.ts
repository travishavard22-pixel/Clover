import type { registerJobHandler } from "../runner";

/** Placeholder until the feature module lands. Replaced in the feature build. */
export function register(r: typeof registerJobHandler) {
  r("ANALYZE_ITEM", async (ctx) => {
    await ctx.log("Handler for ANALYZE_ITEM not implemented yet");
    throw new Error("ANALYZE_ITEM handler not implemented");
  });
}
