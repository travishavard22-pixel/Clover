import { describe, expect, it } from "vitest";
import { buildChecklist, checklistProgress, endListingChecklist, parseChecklist, updatePriceChecklist } from "@/lib/marketplaces/assisted/checklist";

const rendered = { title: "Vintage Lamp", description: "A lamp.\n\nWorks.", priceCents: 4500, categoryHint: "Home > Lighting", shippingLine: "Local pickup in Austin" };

describe("assisted checklist", () => {
  it("builds the guided steps with copy text, links and the photo pack", () => {
    const steps = buildChecklist({ marketplace: "FACEBOOK", itemId: "item1", rendered, photoCount: 14, photoPackHref: "/api/items/item1/publications/FACEBOOK/photo-pack" });
    const keys = steps.map((s) => s.key);
    expect(keys).toEqual(["copy_title", "copy_description", "photos", "open", "category", "price", "location", "posted"]);
    expect(steps[0]!.copyText).toBe("Vintage Lamp");
    expect(steps[2]!.label).toContain("10 photos"); // Facebook caps at 10
    expect(steps[2]!.href).toBe("/api/items/item1/publications/FACEBOOK/photo-pack");
    expect(steps[3]!.href).toBe("https://www.facebook.com/marketplace/create/item");
    expect(steps[5]!.copyText).toBe("45.00");
    expect(steps.every((s) => s.done === false)).toBe(true);
  });

  it("rounds-trips through JSON and drops malformed entries", () => {
    const steps = updatePriceChecklist("MERCARI", "https://www.mercari.com/us/item/m1", 1999);
    const parsed = parseChecklist(JSON.parse(JSON.stringify([...steps, { nope: true }, null, "x"])));
    expect(parsed).toHaveLength(3);
    expect(parsed[0]!.href).toBe("https://www.mercari.com/us/item/m1");
    expect(parsed[1]!.copyText).toBe("19.99");
  });

  it("falls back to the create page when no listing link is known", () => {
    expect(endListingChecklist("OFFERUP", null)[0]!.href).toBe("https://offerup.com/post");
    expect(checklistProgress([{ key: "a", label: "", done: true }, { key: "b", label: "", done: false }])).toEqual({ done: 1, total: 2 });
  });
});
