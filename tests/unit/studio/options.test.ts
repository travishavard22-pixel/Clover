import { describe, expect, it } from "vitest";
import { ANGLE_NOTE, BACKGROUND_PRESETS, NEUTRAL_OPTIONS, StudioOptionsInputSchema, StudioOptionsSchema, colourBalanceRequested, mergeOptions, resolveBackgroundHex } from "@/lib/studio/options";

describe("studio options schema", () => {
  it("accepts presets, auto and 6-digit hex backgrounds only", () => {
    for (const p of BACKGROUND_PRESETS) expect(StudioOptionsSchema.parse({ ...NEUTRAL_OPTIONS, background: p.id }).background).toBe(p.id);
    expect(StudioOptionsSchema.parse({ ...NEUTRAL_OPTIONS, background: "#1E7A4C" }).background).toBe("#1E7A4C");
    expect(StudioOptionsSchema.safeParse({ ...NEUTRAL_OPTIONS, background: "#FFF" }).success).toBe(false);
    expect(StudioOptionsSchema.safeParse({ ...NEUTRAL_OPTIONS, background: "red" }).success).toBe(false);
  });

  it("bounds every numeric control", () => {
    expect(StudioOptionsSchema.safeParse({ ...NEUTRAL_OPTIONS, crop: { aspect: "1:1", padding: 31 } }).success).toBe(false);
    expect(StudioOptionsSchema.safeParse({ ...NEUTRAL_OPTIONS, shadow: { type: "drop", opacity: 1.2, offset: 2 } }).success).toBe(false);
    expect(StudioOptionsSchema.safeParse({ ...NEUTRAL_OPTIONS, shadow: { type: "drop", opacity: 0.5, offset: 11 } }).success).toBe(false);
    expect(StudioOptionsSchema.safeParse({ ...NEUTRAL_OPTIONS, colorBalance: { temperature: 101, exposure: 0 } }).success).toBe(false);
    expect(StudioOptionsSchema.safeParse({ ...NEUTRAL_OPTIONS, colorBalance: { temperature: 0, exposure: -1.5 } }).success).toBe(false);
    expect(StudioOptionsSchema.safeParse({ ...NEUTRAL_OPTIONS, focus: { x: 1.1, y: 0 } }).success).toBe(false);
    expect(StudioOptionsSchema.safeParse({ ...NEUTRAL_OPTIONS, label: "x".repeat(61) }).success).toBe(false);
    expect(StudioOptionsSchema.safeParse({ ...NEUTRAL_OPTIONS, crop: { aspect: "2:3", padding: 0 } }).success).toBe(false);
  });

  it("has no angle option, only flipHorizontal, and explains why", () => {
    expect("angle" in StudioOptionsSchema.shape).toBe(false);
    expect("rotate" in StudioOptionsSchema.shape).toBe(false);
    expect(StudioOptionsSchema.shape.flipHorizontal).toBeDefined();
    expect(ANGLE_NOTE).toMatch(/inventing/i);
    expect(NEUTRAL_OPTIONS.flipHorizontal).toBe(false);
  });

  it("merges partial input over defaults without touching untouched keys", () => {
    const input = StudioOptionsInputSchema.parse({ lighting: "dramatic", crop: { padding: 12 }, shadow: { type: "soft" }, focus: { x: 0.2, y: 0.8 } });
    const merged = mergeOptions(NEUTRAL_OPTIONS, input);
    expect(merged.lighting).toBe("dramatic");
    expect(merged.crop).toEqual({ aspect: "original", padding: 12 });
    expect(merged.shadow).toEqual({ type: "soft", opacity: 0.35, offset: 3 });
    expect(merged.focus).toEqual({ x: 0.2, y: 0.8 });
    expect(merged.background).toBe("auto");
    expect(StudioOptionsSchema.parse(merged)).toEqual(merged);
    const copy = mergeOptions(NEUTRAL_OPTIONS, undefined);
    expect(copy).toEqual(NEUTRAL_OPTIONS);
    expect(copy.crop).not.toBe(NEUTRAL_OPTIONS.crop);
  });

  it("colour balance is off by default and detected when requested", () => {
    expect(colourBalanceRequested(NEUTRAL_OPTIONS)).toBe(false);
    expect(colourBalanceRequested({ ...NEUTRAL_OPTIONS, colorBalance: { temperature: 10, exposure: 0 } })).toBe(true);
    expect(colourBalanceRequested({ ...NEUTRAL_OPTIONS, colorBalance: { temperature: 0, exposure: -0.1 } })).toBe(true);
  });

  it("resolves backgrounds to hex", () => {
    expect(resolveBackgroundHex("auto", "#ABCDEF")).toBe("#ABCDEF");
    expect(resolveBackgroundHex("white", "#000000")).toBe("#FFFFFF");
    expect(resolveBackgroundHex("#abcdef", "#000000")).toBe("#ABCDEF");
  });
});
