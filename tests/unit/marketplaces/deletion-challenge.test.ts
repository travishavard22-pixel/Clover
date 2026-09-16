import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { challengeResponse } from "@/lib/marketplaces/ebay/deletion-challenge";

describe("eBay account-deletion challenge", () => {
  it("hashes challengeCode + verificationToken + endpoint, in that order, as hex", () => {
    const code = "71745723-d031-455c-bfa5-f90d11b4f20a";
    const token = "71745723-d031-455c-bfa5-f90d11b4f20a-verification";
    const endpoint = "https://clover.example/api/webhooks/ebay/account-deletion";
    const expected = createHash("sha256").update(code + token + endpoint).digest("hex");
    expect(challengeResponse(code, token, endpoint)).toBe(expected);
    expect(challengeResponse(code, token, endpoint)).toMatch(/^[0-9a-f]{64}$/);
    expect(challengeResponse(code, token, `${endpoint}/`)).not.toBe(expected);
  });
});
