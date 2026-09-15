import type { AiProvider } from "./provider";

/** Placeholder — replaced by the full deterministic demo provider in the feature build. */
export class DemoAiProvider implements AiProvider {
  readonly name = "demo" as const;
  async identify(): Promise<never> {
    throw new Error("Demo AI provider not implemented yet");
  }
  async writeListing(): Promise<never> {
    throw new Error("Demo AI provider not implemented yet");
  }
  async studioQa(): Promise<never> {
    throw new Error("not implemented");
  }
  async offerAdvice(): Promise<never> {
    throw new Error("not implemented");
  }
  async *copilot(): AsyncGenerator<never> {
    throw new Error("not implemented");
  }
}
