import { describe, expect, it } from "vitest";
import { formatMoney, parseMoney, pct, roundToPricePoint } from "@/lib/money";
import { generateSku } from "@/lib/sku";

describe("money", () => {
  it("formats cents", () => {
    expect(formatMoney(18500)).toBe("$185.00");
    expect(formatMoney(18500, "USD", { compact: true })).toBe("$185");
    expect(formatMoney(1999, "USD", { compact: true })).toBe("$19.99");
    expect(formatMoney(null)).toBe("—");
  });
  it("parses user input", () => {
    expect(parseMoney("$1,234.5")).toBe(123450);
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("")).toBeNull();
  });
  it("rounds to marketplace price points", () => {
    expect(roundToPricePoint(450)).toBe(500);
    expect(roundToPricePoint(2460)).toBe(2499);
    expect(roundToPricePoint(18540)).toBe(18500);
    expect(roundToPricePoint(31200)).toBe(31000);
  });
  it("percent", () => {
    expect(pct(1, 3)).toBe(33.3);
    expect(pct(1, 0)).toBe(0);
  });
});

describe("sku", () => {
  it("is human readable and unique enough", () => {
    const a = generateSku(new Date("2026-09-15T00:00:00Z"));
    expect(a).toMatch(/^CLV-2609-[A-Z2-9]{4}$/);
    const set = new Set(Array.from({ length: 500 }, () => generateSku()));
    expect(set.size).toBeGreaterThan(495);
  });
});
