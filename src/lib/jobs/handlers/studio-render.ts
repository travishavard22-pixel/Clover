import type { registerJobHandler } from "../runner";

/** Placeholder until the feature module lands. Replaced in the feature build. */
export function register(r: typeof registerJobHandler) {
  r("STUDIO_RENDER", async (ctx) => {
    await ctx.log("Handler for STUDIO_RENDER not implemented yet");
    throw new Error("STUDIO_RENDER handler not implemented");
  });
}
