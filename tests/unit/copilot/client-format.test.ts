import { describe, expect, it } from "vitest";
import { threadTitleFrom } from "@/lib/copilot/prompts";
import { parseTrace } from "@/lib/copilot/threads";
import { relativeTime, untilTime } from "@/lib/client/time";

describe("threadTitleFrom", () => {
  it("trims, capitalises and truncates", () => {
    expect(threadTitleFrom("  what should i sell first?  ")).toBe("What should i sell first?");
    expect(threadTitleFrom("")).toBe("New conversation");
    const long = threadTitleFrom("a".repeat(100));
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("parseTrace", () => {
  it("returns null for non-objects and fills defaults", () => {
    expect(parseTrace(null)).toBeNull();
    expect(parseTrace("x")).toBeNull();
    expect(parseTrace({})).toEqual({ tools: [], proposals: [], stopped: false, applied: undefined });
  });

  it("keeps the applied note written by apply-proposal", () => {
    const t = parseTrace({ tools: [], proposals: [], applied: { proposalId: "p1", kind: "price_change", summary: "Now $92." } });
    expect(t?.applied?.summary).toBe("Now $92.");
  });
});

describe("time helpers", () => {
  const now = Date.parse("2026-09-16T12:00:00Z");
  it("relativeTime", () => {
    expect(relativeTime("2026-09-16T11:59:50Z", now)).toBe("just now");
    expect(relativeTime("2026-09-16T11:30:00Z", now)).toBe("30 min ago");
    expect(relativeTime("2026-09-16T09:00:00Z", now)).toBe("3 hours ago");
    expect(relativeTime("2026-09-14T12:00:00Z", now)).toBe("2 days ago");
    expect(relativeTime("not a date", now)).toBe("");
  });
  it("untilTime", () => {
    expect(untilTime("2026-09-16T11:00:00Z", now)).toBe("now");
    expect(untilTime("2026-09-16T15:00:00Z", now)).toBe("in 3 hours");
    expect(untilTime("2026-09-23T12:00:00Z", now)).toBe("in 7 days");
  });
});
