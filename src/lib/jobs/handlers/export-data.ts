import type { registerJobHandler } from "../runner";

/** Placeholder until the feature module lands. Replaced in the feature build. */
export function register(r: typeof registerJobHandler) {
  r("EXPORT_DATA", async (ctx) => {
    await ctx.log("Handler for EXPORT_DATA not implemented yet");
    throw new Error("EXPORT_DATA handler not implemented");
  });
}
