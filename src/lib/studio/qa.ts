import { getAiProvider } from "@/lib/ai";
import { forVision } from "@/lib/images";
import type { StudioModeId } from "./modes";

export type QaOutcome = { status: "pass" | "fail" | "unavailable"; reason: string; provider: string };

export class StudioQaFailed extends Error {
  constructor(public readonly outcome: QaOutcome) {
    super(`Studio check failed: ${outcome.reason}`);
    this.name = "StudioQaFailed";
  }
}

/**
 * Same item? Same defects? Nothing added or removed? Asks the configured AI provider to compare
 * the original with the output and fails the render on a `fail` verdict. If the provider itself
 * is unavailable we say so rather than pretending the check ran.
 */
export async function runStudioQa(original: Buffer, output: Buffer, mode: StudioModeId): Promise<QaOutcome> {
  const ai = await getAiProvider();
  let verdict: Awaited<ReturnType<typeof ai.studioQa>>;
  try {
    const [o, g] = await Promise.all([forVision(original), forVision(output)]);
    verdict = await ai.studioQa({ original: { data: o, mimeType: "image/jpeg", label: "original" }, generated: { data: g, mimeType: "image/jpeg", label: "studio" }, mode });
  } catch (err) {
    return { status: "unavailable", reason: `Automatic check unavailable (${err instanceof Error ? err.message : String(err)}) — review the result yourself`, provider: ai.name };
  }
  const outcome: QaOutcome = {
    status: verdict.verdict === "pass" ? "pass" : "fail",
    reason: verdict.reason || (verdict.verdict === "pass" ? "Same item, defects still visible, nothing added or removed" : "The check flagged a difference"),
    provider: ai.name,
  };
  if (outcome.status === "fail") throw new StudioQaFailed(outcome);
  return outcome;
}
