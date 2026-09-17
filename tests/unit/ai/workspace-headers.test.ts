import { describe, expect, it } from "vitest";
import { workspaceHeaders } from "@/lib/ai/anthropic";

describe("workspaceHeaders", () => {
  it("names the workspace when one is configured", () => {
    expect(workspaceHeaders("wrkspc_01ABC")).toEqual({ "anthropic-workspace-id": "wrkspc_01ABC" });
  });

  it("trims the value, because a pasted ID picks up whitespace", () => {
    expect(workspaceHeaders("  wrkspc_01ABC\n")).toEqual({ "anthropic-workspace-id": "wrkspc_01ABC" });
  });

  it("sends no header at all when unset or blank", () => {
    // A key created inside a workspace carries its own scope. Sending the header empty is a 400 in
    // its own right, so "not configured" has to mean absent rather than "".
    expect(workspaceHeaders(undefined)).toBeUndefined();
    expect(workspaceHeaders("")).toBeUndefined();
    expect(workspaceHeaders("   ")).toBeUndefined();
  });
});
