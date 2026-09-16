import { describe, expect, it } from "vitest";
import { StudioMode } from "../../../generated/prisma/enums";
import { STUDIO_MODES, STUDIO_MODE_IDS, STUDIO_MODE_LIST, isStudioMode, photoKindForMode } from "@/lib/studio/modes";
import { StudioOptionsSchema } from "@/lib/studio/options";

describe("studio mode table", () => {
  it("has the eight modes of the Prisma enum, in order", () => {
    expect([...STUDIO_MODE_IDS]).toEqual(Object.values(StudioMode));
    expect(STUDIO_MODE_LIST.map((m) => m.id)).toEqual([...STUDIO_MODE_IDS]);
    expect(isStudioMode("LUXURY")).toBe(true);
    expect(isStudioMode("VINTAGE")).toBe(false);
  });

  it("every mode ships valid defaults and honest copy", () => {
    for (const m of STUDIO_MODE_LIST) {
      expect(StudioOptionsSchema.safeParse(m.defaults).success).toBe(true);
      expect(m.name.length).toBeGreaterThan(0);
      expect(m.does.length).toBeGreaterThan(20);
      expect(m.defaults.colorBalance).toEqual({ temperature: 0, exposure: 0 });
      expect(/magic|supercharge|AI-powered/i.test(m.description + m.does)).toBe(false);
    }
  });

  it("matches the product spec per mode", () => {
    expect(STUDIO_MODES.CLEAN_STUDIO.defaults).toMatchObject({ background: "paper", shadow: { type: "contact" } });
    expect(STUDIO_MODES.CLEAN_STUDIO.autoBackgroundHex).toBe("#F8F7F3");
    expect(STUDIO_MODES.LUXURY.defaults).toMatchObject({ background: "charcoal", lighting: "dramatic", shadow: { type: "soft" } });
    expect(STUDIO_MODES.LIFESTYLE.usesGenerator).toBe(true);
    expect(STUDIO_MODES.ECOMMERCE.defaults).toMatchObject({ background: "white", crop: { aspect: "1:1", padding: 8 } });
    expect(STUDIO_MODES.ECOMMERCE.autoBackgroundHex).toBe("#FFFFFF");
    expect(STUDIO_MODES.MARKETPLACE.defaults.crop).toEqual({ aspect: "4:3", padding: 7.5 }); // 100 − 2 × 7.5 = 85 % fill
    expect(STUDIO_MODES.SOCIAL.defaults.crop.aspect).toBe("1:1");
    expect(STUDIO_MODES.SOCIAL.defaults.crop.padding).toBeGreaterThanOrEqual(15);
    expect(STUDIO_MODES.DETAIL).toMatchObject({ needsSegmentation: false, keepsBackground: true, usesFocus: true });
    expect(STUDIO_MODES.CONDITION).toMatchObject({ needsSegmentation: false, keepsBackground: true, usesFocus: true });
    expect(STUDIO_MODES.CONDITION.honestyNote).toBe("Shows imperfections clearly. Never hides them.");
    expect(STUDIO_MODES.CONDITION.defaults.shadow.type).toBe("none");
  });

  it("maps CONDITION to the CONDITION photo kind and everything else to STUDIO", () => {
    expect(photoKindForMode("CONDITION")).toBe("CONDITION");
    for (const id of STUDIO_MODE_IDS.filter((m) => m !== "CONDITION")) expect(photoKindForMode(id)).toBe("STUDIO");
  });
});
