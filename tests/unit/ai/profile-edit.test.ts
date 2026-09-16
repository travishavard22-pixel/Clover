import { describe, expect, it } from "vitest";
import { applyAlternative, applyFieldEdit, mergeUserVerified, parseCategoryPath, parseStoredProfile, type StoredProfile } from "@/lib/ai/profile-edit";
import type { ItemProfile } from "@/lib/ai/schemas";

const field = (value: string, confidence = 0.7) => ({ value, confidence, tier: confidence >= 0.85 ? ("CONFIDENT" as const) : confidence >= 0.6 ? ("LIKELY" as const) : ("NEEDS_CHECK" as const), evidenceImage: 1, note: "Read from label" });

function profile(): StoredProfile {
  const p: ItemProfile = {
    itemName: field("Leica M6 rangefinder camera", 0.7),
    brand: field("Leica", 0.9),
    model: field("M6", 0.65),
    modelNumber: null,
    categoryPath: ["Cameras & Photo", "Film Cameras"],
    categoryConfidence: 0.8,
    color: field("Black", 0.9),
    material: null,
    size: null,
    dimensions: null,
    approximateAge: null,
    attributes: [{ name: "Mount", field: field("Leica M", 0.8) }],
    accessoriesIncluded: [],
    possiblyMissing: ["Lens cap"],
    condition: { grade: "GOOD", confidence: 0.8, tier: "LIKELY", summary: "Used.", defects: [], functionalStatus: "untested" },
    identityConfidence: 0.7,
    identityTier: "LIKELY",
    alternativeIdentifications: [{ itemName: "Leica M4-P rangefinder camera", brand: "Leica", model: "M4-P", likelihood: 0.25 }],
    unknowns: ["Serial number", "Shutter speeds working"],
    needsMorePhotos: ["serial_number"],
    searchKeywords: ["leica", "m6"],
    barcodeVisible: null,
    notes: null,
  };
  return { ...p, userVerified: [] };
}

describe("applyFieldEdit", () => {
  it("verifies a field, mirrors it and confirms identity for identity fields", () => {
    const r = applyFieldEdit(profile(), "model", "M6 TTL");
    expect(r.profile.model).toMatchObject({ value: "M6 TTL", confidence: 1, tier: "CONFIDENT", note: "Confirmed by you" });
    expect(r.profile.userVerified).toEqual(["model"]);
    expect(r.profile.identityTier).toBe("CONFIDENT");
    expect(r.mirror).toMatchObject({ model: "M6 TTL", userEdited: ["model"] });
    expect(r.identityChanged).toBe(true);
  });

  it("clears a nullable field with an empty value and un-verifies it", () => {
    const once = applyFieldEdit(profile(), "color", "Chrome").profile;
    const r = applyFieldEdit(once, "color", "");
    expect(r.profile.color).toBeNull();
    expect(r.profile.userVerified).toEqual([]);
    expect(r.mirror.specifics).toEqual({ Color: null });
    expect(r.identityChanged).toBe(false);
  });

  it("refuses to clear the item name", () => {
    expect(() => applyFieldEdit(profile(), "itemName", "  ")).toThrow(/cannot be empty/);
  });

  it("turns an unknown into a verified attribute", () => {
    const r = applyFieldEdit(profile(), "attribute:Serial number", "1234567");
    expect(r.profile.attributes.find((a) => a.name === "Serial number")?.field.value).toBe("1234567");
    expect(r.profile.unknowns).toEqual(["Shutter speeds working"]);
    expect(r.profile.userVerified).toContain("attribute:Serial number");
    expect(r.mirror.specifics).toEqual({ "Serial number": "1234567" });
  });

  it("updates an existing attribute case-insensitively and keeps its name", () => {
    const r = applyFieldEdit(profile(), "attribute:mount", "Leica M bayonet");
    expect(r.profile.attributes).toHaveLength(1);
    expect(r.profile.attributes[0]).toMatchObject({ name: "Mount", field: { value: "Leica M bayonet", tier: "CONFIDENT" } });
  });

  it("parses category paths from ' > ' and '/' separators", () => {
    expect(parseCategoryPath("Cameras & Photo > Film Photography / Film Cameras")).toEqual(["Cameras & Photo", "Film Photography", "Film Cameras"]);
    const r = applyFieldEdit(profile(), "categoryPath", "A > B");
    expect(r.profile.categoryPath).toEqual(["A", "B"]);
    expect(r.profile.categoryConfidence).toBe(1);
    expect(r.mirror).toMatchObject({ categoryPath: ["A", "B"], userEdited: ["categoryPath"] });
  });
});

describe("applyAlternative", () => {
  it("adopts the alternative and keeps the previous identity as an alternative", () => {
    const r = applyAlternative(profile(), 0);
    expect(r.profile.itemName.value).toBe("Leica M4-P rangefinder camera");
    expect(r.profile.model?.value).toBe("M4-P");
    expect(r.profile.identityTier).toBe("CONFIDENT");
    expect(r.profile.alternativeIdentifications[0]).toMatchObject({ itemName: "Leica M6 rangefinder camera", model: "M6" });
    expect(r.profile.userVerified).toEqual(["itemName", "brand", "model"]);
    expect(r.mirror).toMatchObject({ title: "Leica M4-P rangefinder camera", brand: "Leica", model: "M4-P" });
  });

  it("rejects a missing index", () => {
    expect(() => applyAlternative(profile(), 5)).toThrow(/no longer exists/);
  });
});

describe("mergeUserVerified", () => {
  it("re-applies verified fields onto a fresh profile", () => {
    const edited = applyFieldEdit(applyFieldEdit(profile(), "model", "M6 TTL").profile, "attribute:Serial number", "1234567").profile;
    const fresh: ItemProfile = { ...profile(), model: field("M6 Classic", 0.6), identityConfidence: 0.6, identityTier: "LIKELY", attributes: [] };
    const merged = mergeUserVerified(edited, fresh);
    expect(merged.model?.value).toBe("M6 TTL");
    expect(merged.attributes.map((a) => a.name)).toEqual(["Serial number"]);
    expect(merged.identityTier).toBe("CONFIDENT");
    expect(merged.userVerified).toEqual(["model", "attribute:Serial number"]);
  });

  it("returns the fresh profile unchanged when nothing was verified", () => {
    const fresh = profile();
    expect(mergeUserVerified(null, fresh)).toEqual({ ...fresh, userVerified: [] });
  });
});

describe("parseStoredProfile", () => {
  it("tolerates a profile without the userVerified list", () => {
    const { userVerified: _u, ...raw } = profile();
    void _u;
    expect(parseStoredProfile(raw)?.userVerified).toEqual([]);
    expect(parseStoredProfile({ nope: true })).toBeNull();
  });
});
