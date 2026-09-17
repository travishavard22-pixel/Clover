import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { effortFromCapability } from "@/lib/ai/anthropic";

type Caps = Anthropic.Models.EffortCapability;
const caps = (o: Partial<Record<"supported" | "low" | "medium" | "high" | "max", boolean>>): Caps =>
  ({
    supported: o.supported ?? true,
    low: { supported: o.low ?? true },
    medium: { supported: o.medium ?? true },
    high: { supported: o.high ?? true },
    max: { supported: o.max ?? false },
    xhigh: null,
  }) as Caps;

describe("effortFromCapability", () => {
  it("sends the level when the model supports it", () => {
    expect(effortFromCapability(caps({}), "low")).toBe("low");
    expect(effortFromCapability(caps({}), "medium")).toBe("medium");
    expect(effortFromCapability(caps({}), "high")).toBe("high");
  });

  it("omits the parameter when the model does not support effort at all", () => {
    // This is the live case: Haiku 4.5 answers a request carrying `effort` with
    // "This model does not support the effort parameter", which failed the whole listing step.
    expect(effortFromCapability(caps({ supported: false }), "low")).toBeUndefined();
  });

  it("omits the parameter when the specific level is unsupported", () => {
    // Support is per level, so "supported: true" alone is not enough to send any level.
    expect(effortFromCapability(caps({ high: false }), "high")).toBeUndefined();
    expect(effortFromCapability(caps({ high: false }), "medium")).toBe("medium");
  });

  it("omits the parameter when capability is unknown", () => {
    // A failed lookup, or a model the API reports nothing about. Erring towards omission keeps a
    // diagnostic call from breaking the request it was meant to describe.
    expect(effortFromCapability(null, "medium")).toBeUndefined();
    expect(effortFromCapability(undefined, "medium")).toBeUndefined();
  });
});
