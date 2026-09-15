import type { registerJobHandler } from "../runner";

/** Placeholder until the feature module lands. Replaced in the feature build. */
export function register(r: typeof registerJobHandler) {
  r("DELETE_ACCOUNT", async (ctx) => {
    await ctx.log("Handler for DELETE_ACCOUNT not implemented yet");
    throw new Error("DELETE_ACCOUNT handler not implemented");
  });
}
