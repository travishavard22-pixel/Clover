import { capabilities } from "../env";
import type { AiProvider } from "./provider";

let cached: AiProvider | null = null;

/** Returns the configured AI provider. Anthropic when a key is present, otherwise the labelled Demo provider. */
export async function getAiProvider(): Promise<AiProvider> {
  if (cached) return cached;
  if (capabilities.ai) {
    const { AnthropicProvider } = await import("./anthropic");
    cached = new AnthropicProvider();
  } else {
    const { DemoAiProvider } = await import("./demo");
    cached = new DemoAiProvider();
  }
  return cached;
}

export * from "./provider";
export * from "./schemas";
