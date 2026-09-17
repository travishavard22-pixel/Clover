import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils/cn";

describe("cn", () => {
  it("keeps non-conflicting classes in order", () => {
    expect(cn("flex", "items-center", "gap-2")).toBe("flex items-center gap-2");
  });

  it("accepts arrays, objects, and falsy values", () => {
    expect(cn("a", ["b", ["c"]], { d: true, e: false }, null, undefined, false, 0)).toBe("a b c d");
  });

  it("lets the last class of a conflicting group win", () => {
    expect(cn("text-sm", "text-lg")).toBe("text-lg");
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-primary", "text-muted")).toBe("text-muted");
  });

  it("resolves an arbitrary value against a named one — the bug that made KPI values truncate", () => {
    // The dashboard tile shrinks long values. Concatenation emitted both sizes and the arbitrary
    // value won from the stylesheet's order, so the shrink never took effect.
    expect(cn("display truncate text-[1.65rem]", "text-xl")).toBe("display truncate text-xl");
  });

  it("applies a conditional override only when it is on", () => {
    const size = (long: boolean) => cn("text-[1.65rem]", long && "text-xl");
    expect(size(true)).toBe("text-xl");
    expect(size(false)).toBe("text-[1.65rem]");
  });

  it("lets a caller's className override a component's base classes", () => {
    expect(cn("h-6 text-xs", "h-5 text-[10px]")).toBe("h-5 text-[10px]");
  });

  it("passes the project's own utilities through untouched", () => {
    // tailwind-merge does not know these, so they must survive rather than be folded into a group.
    const customs = "display serif-display surface-card surface-sheet gutter content-max tabular hero-wash hide-scrollbar skeleton safe-bottom scrim-text touch-target";
    expect(cn(customs)).toBe(customs);
    // `display` is a font utility here, not CSS `display`, so a real display class must not drop it.
    expect(cn("display", "flex")).toBe("display flex");
    // Same for `tabular`, which is not tailwind's `tabular-nums`.
    expect(cn("tabular", "tabular-nums")).toBe("tabular tabular-nums");
  });

  it("keeps variants separate from their unprefixed class", () => {
    expect(cn("text-sm", "md:text-lg")).toBe("text-sm md:text-lg");
    expect(cn("md:text-sm", "md:text-lg")).toBe("md:text-lg");
  });
});
