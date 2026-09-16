import { describe, expect, it } from "vitest";
import { diffLines, diffWords, summarizeDiff } from "@/lib/listings/diff";

describe("diffWords", () => {
  it("returns a single equal op for identical text", () => {
    const ops = diffWords("Leica M6 camera", "Leica M6 camera");
    expect(ops).toEqual([{ kind: "equal", text: "Leica M6 camera" }]);
    expect(summarizeDiff(ops).changed).toBe(false);
  });

  it("marks inserted and deleted words while keeping the common words", () => {
    const ops = diffWords("Vintage Leica M6 camera, tested.", "Leica M6 film camera, untested.");
    const kinds = ops.map((o) => o.kind);
    expect(kinds[0]).toBe("delete");
    expect(ops.find((o) => o.kind === "insert" && o.text.includes("film"))).toBeTruthy();
    expect(ops.filter((o) => o.kind === "equal").map((o) => o.text).join("")).toContain("Leica M6 ");
    const s = summarizeDiff(ops);
    expect(s.inserted).toBeGreaterThan(0);
    expect(s.deleted).toBeGreaterThan(0);
  });

  it("reconstructs the after text from equal + insert ops", () => {
    const before = "One two three four";
    const after = "One 2 three four five";
    const ops = diffWords(before, after);
    expect(ops.filter((o) => o.kind !== "delete").map((o) => o.text).join("")).toBe(after);
    expect(ops.filter((o) => o.kind !== "insert").map((o) => o.text).join("").trim()).toBe(before);
  });

  it("handles empty sides", () => {
    expect(diffWords("", "new")).toEqual([{ kind: "insert", text: "new" }]);
    expect(diffWords("old", "")).toEqual([{ kind: "delete", text: "old" }]);
    expect(diffWords("", "")).toEqual([]);
  });
});

describe("diffLines", () => {
  it("diffs bullet lists line by line", () => {
    const ops = diffLines(["Works", "Includes strap"], ["Works", "Includes strap and cap"]);
    expect(ops.some((o) => o.kind === "insert" && o.text.includes("cap"))).toBe(true);
    expect(ops.some((o) => o.kind === "delete")).toBe(false);
  });
});
