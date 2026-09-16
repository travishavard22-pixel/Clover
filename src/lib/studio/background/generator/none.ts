import { GeneratorUnavailable, type BackgroundGenerator, type GenerateBackgroundOutput } from "./types";

export class NoGenerator implements BackgroundGenerator {
  readonly name = "none";
  async generate(): Promise<GenerateBackgroundOutput> {
    throw new GeneratorUnavailable();
  }
}
