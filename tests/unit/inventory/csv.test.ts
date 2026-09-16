import { describe, expect, it } from "vitest";
import { CSV_HEADERS, csvEscape, itemsToCsv, toCsv } from "@/lib/inventory/csv";

describe("csvEscape", () => {
  it("leaves plain values alone", () => {
    expect(csvEscape("Canon AE-1")).toBe("Canon AE-1");
    expect(csvEscape(42)).toBe("42");
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
  });
  it("quotes commas, quotes and newlines and doubles embedded quotes", () => {
    expect(csvEscape("Levi's, Type III")).toBe('"Levi\'s, Type III"');
    expect(csvEscape('12" record')).toBe('"12"" record"');
    expect(csvEscape("line one\nline two")).toBe('"line one\nline two"');
  });
  it("neutralises spreadsheet formula triggers", () => {
    expect(csvEscape("=SUM(A1:A9)")).toBe("'=SUM(A1:A9)");
    expect(csvEscape("+1 555 0100")).toBe("'+1 555 0100");
    expect(csvEscape("-5")).toBe("'-5");
    expect(csvEscape("@handle")).toBe("'@handle");
    expect(csvEscape("=cmd|' /C calc'!A0")).toBe("'=cmd|' /C calc'!A0");
    expect(csvEscape("=HYPERLINK(\"x\"),y")).toBe(`"'=HYPERLINK(""x""),y"`);
  });
  it("formats dates as ISO and arrays as a path", () => {
    expect(csvEscape(new Date("2026-09-16T12:00:00Z"))).toBe("2026-09-16T12:00:00.000Z");
    expect(csvEscape(["Cameras & Photo", "Film Cameras"])).toBe("Cameras & Photo > Film Cameras");
  });
});

describe("toCsv / itemsToCsv", () => {
  it("uses CRLF line endings and a trailing newline", () => {
    expect(toCsv(["a", "b"], [[1, "x"], ["y,z", null]])).toBe('a,b\r\n1,x\r\n"y,z",\r\n');
  });
  it("exports items with dollar amounts", () => {
    const csv = itemsToCsv([
      {
        sku: "CLV-2609-ABCD",
        title: 'Vintage "Aperture" lamp, teak',
        status: "LISTED",
        brand: null,
        model: null,
        categoryPath: ["Home & Garden", "Lamps"],
        conditionGrade: "VERY_GOOD",
        quantity: 1,
        acquisitionCost: 2_500,
        estimatedValue: 14_000,
        listPrice: 14_900,
        floorPrice: 11_000,
        soldPrice: null,
        fees: null,
        shippingCost: null,
        soldMarketplace: null,
        storageLocation: "Shelf B2",
        acquiredAt: null,
        listedAt: new Date("2026-08-27T00:00:00Z"),
        soldAt: null,
        createdAt: new Date("2026-08-26T00:00:00Z"),
        notes: "=not a formula",
      },
    ]);
    const [header, row] = csv.split("\r\n");
    expect(header).toBe(CSV_HEADERS.join(","));
    expect(row).toContain('"Vintage ""Aperture"" lamp, teak"');
    expect(row).toContain("Home & Garden > Lamps");
    expect(row).toContain(",25.00,140.00,149.00,110.00,,,,");
    expect(row?.endsWith("'=not a formula")).toBe(true);
  });
});
