import type { ConditionGrade } from "../db";
import { tierFromConfidence, type EvidencedField, type ItemProfile } from "../ai/schemas";

/**
 * The demo catalogue: twelve fully specified items the Demo AI provider "identifies", the Demo
 * comps provider "finds", and the seed script materialises. Everything here is deterministic and
 * labelled demo by the consumers (provider: "demo", isMarketEvidence: false).
 *
 * Evidence image indexes are 1-based and assume up to four photos; the provider clamps them to the
 * number of photos actually supplied.
 */

export type DemoComp = {
  title: string;
  /** cents */
  price: number;
  /** cents; 0 = free shipping */
  shipping: number;
  condition: string;
  conditionGrade: ConditionGrade | null;
  buyingOption: "FIXED_PRICE" | "AUCTION" | "BEST_OFFER";
  /** listing age in days relative to "now" */
  daysAgo: number;
  /** when set the comp is a (demo) sold record this many days ago */
  soldDaysAgo?: number;
};

export type DemoListingCopy = {
  title: string;
  seoTitle: string;
  intro: string[];
  persuasiveIntro: string;
  bullets: string[];
  keywords: string[];
  specifics: Array<{ name: string; value: string }>;
  suggestedCategoryPath: string[];
};

export type DemoCatalogEntry = {
  slug: string;
  /** Lower-case terms matched against the seller's hints (title/notes/brand/category). */
  keywords: string[];
  profile: ItemProfile;
  /** Applied on the escalated second pass (higher-effort model) for low-confidence items. */
  escalated?: Partial<ItemProfile>;
  comps: DemoComp[];
  vocabulary: { aspects: string[]; categories: string[] };
  copy: DemoListingCopy;
};

function f(value: string, confidence: number, evidenceImage: number | null, note: string | null = null): EvidencedField {
  return { value, confidence, tier: tierFromConfidence(confidence), evidenceImage, note };
}

function attr(name: string, value: string, confidence: number, evidenceImage: number | null, note: string | null = null) {
  return { name, field: f(value, confidence, evidenceImage, note) };
}

const $ = (dollars: number) => Math.round(dollars * 100);

export const DEMO_CATALOG: DemoCatalogEntry[] = [
  // ───────────────────────── 1. Film camera ─────────────────────────
  {
    slug: "canon-ae1-program",
    keywords: ["camera", "canon", "ae-1", "ae1", "film", "slr", "35mm", "rangefinder", "leica", "nikon", "pentax", "minolta"],
    profile: {
      itemName: f("Canon AE-1 Program 35mm SLR film camera with 50mm f/1.8 lens", 0.93, 1, "Nameplate reads 'Canon AE-1 PROGRAM'; lens ring reads 'FD 50mm 1:1.8'"),
      brand: f("Canon", 0.98, 1, "Brand engraved on the prism housing"),
      model: f("AE-1 Program", 0.95, 1, "'PROGRAM' below the model name on the front plate"),
      modelNumber: null,
      categoryPath: ["Cameras & Photo", "Film Photography", "Film Cameras"],
      categoryConfidence: 0.97,
      color: f("Black and chrome", 0.96, 1, "Chrome top plate, black leatherette"),
      material: null,
      size: null,
      dimensions: null,
      approximateAge: f("1981–1987", 0.7, null, "Production years of the AE-1 Program; not read from the photos"),
      attributes: [
        attr("Lens", "Canon FD 50mm f/1.8", 0.94, 2, "Front lens ring text"),
        attr("Film format", "35mm", 0.97, 1),
        attr("Focus type", "Manual", 0.9, 2),
        attr("Battery", "4LR44 / PX28 (not shown)", 0.55, null, "Standard for this model; battery compartment not photographed"),
      ],
      accessoriesIncluded: ["Canon FD 50mm f/1.8 lens", "Neck strap"],
      possiblyMissing: ["Lens cap not shown", "Body cap not shown", "Battery not shown"],
      condition: {
        grade: "VERY_GOOD",
        confidence: 0.82,
        tier: "LIKELY",
        summary: "Clean body with light brassing on the top plate edges and a small scuff on the base plate. Lens glass looks clear in the photos; shutter and light meter are untested.",
        defects: [
          { type: "wear", location: "Top plate edges", severity: "minor", description: "Light brassing where the chrome has worn through", evidenceImage: 1 },
          { type: "scuff", location: "Base plate near tripod socket", severity: "minor", description: "Small scuff, no dent", evidenceImage: 3 },
        ],
        functionalStatus: "untested",
      },
      identityConfidence: 0.93,
      identityTier: "CONFIDENT",
      alternativeIdentifications: [],
      unknowns: ["Does the shutter fire at all speeds", "Does the light meter respond", "Light seal condition (foam often degrades on this model)", "Serial number"],
      needsMorePhotos: ["serial_number", "inside", "power_on_screen"],
      searchKeywords: ["Canon AE-1 Program", "AE-1 Program 35mm", "Canon FD 50mm 1.8", "35mm SLR film camera", "Canon AE1"],
      barcodeVisible: null,
      notes: null,
    },
    comps: [
      { title: "Canon AE-1 Program 35mm SLR Film Camera w/ FD 50mm f/1.8 Lens - Tested Works", price: $(189), shipping: $(12.5), condition: "Used", conditionGrade: "VERY_GOOD", buyingOption: "FIXED_PRICE", daysAgo: 6 },
      { title: "Canon AE-1 Program 35mm Film Camera Body Only Black Chrome", price: $(119), shipping: 0, condition: "Used", conditionGrade: "GOOD", buyingOption: "BEST_OFFER", daysAgo: 14 },
      { title: "Canon AE-1 Program with 50mm 1.8 FD lens strap excellent", price: $(210), shipping: $(9.99), condition: "Used", conditionGrade: "LIKE_NEW", buyingOption: "FIXED_PRICE", daysAgo: 3 },
      { title: "Canon AE-1 PROGRAM SLR 35mm camera + FD 50mm f/1.8 - new light seals", price: $(175), shipping: 0, condition: "Used", conditionGrade: "VERY_GOOD", buyingOption: "FIXED_PRICE", daysAgo: 21, soldDaysAgo: 4 },
      { title: "Canon AE-1 Program 35mm camera with FD 50mm 1.8, film tested", price: $(165), shipping: $(14), condition: "Used", conditionGrade: "VERY_GOOD", buyingOption: "BEST_OFFER", daysAgo: 30, soldDaysAgo: 9 },
      { title: "Canon AE-1 35mm SLR camera body - meter works", price: $(95), shipping: $(11), condition: "Used", conditionGrade: "GOOD", buyingOption: "AUCTION", daysAgo: 2 },
      { title: "Canon AE-1 Program 35mm Film Camera FD 50mm f1.8 lens - Mint", price: $(249), shipping: 0, condition: "Used", conditionGrade: "LIKE_NEW", buyingOption: "FIXED_PRICE", daysAgo: 9 },
      { title: "Canon AE-1 Program camera 50mm lens - FOR PARTS shutter stuck", price: $(45), shipping: $(12), condition: "For parts or not working", conditionGrade: "FOR_PARTS", buyingOption: "FIXED_PRICE", daysAgo: 5 },
      { title: "Lot of 3 Canon AE-1 / AE-1 Program cameras untested", price: $(260), shipping: $(25), condition: "Used", conditionGrade: null, buyingOption: "FIXED_PRICE", daysAgo: 12 },
      { title: "Canon AE-1 Program 35mm SLR with 50mm f/1.8 lens, case, manual", price: $(199), shipping: $(10), condition: "Used", conditionGrade: "VERY_GOOD", buyingOption: "FIXED_PRICE", daysAgo: 40 },
      { title: "Minolta X-700 35mm SLR film camera with 50mm f/1.7", price: $(140), shipping: $(12), condition: "Used", conditionGrade: "VERY_GOOD", buyingOption: "FIXED_PRICE", daysAgo: 8 },
      { title: "Canon AE-1 Program 35mm film SLR camera, FD 50mm 1.8 - tested, film in it", price: $(155), shipping: $(12.5), condition: "Used", conditionGrade: "GOOD", buyingOption: "FIXED_PRICE", daysAgo: 55 },
      { title: "Canon AE-1 Program + FD 50mm f/1.8 + Canon 199A flash", price: $(230), shipping: $(15), condition: "Used", conditionGrade: "VERY_GOOD", buyingOption: "BEST_OFFER", daysAgo: 17 },
      { title: "CANON AE-1 PROGRAM 35mm SLR Film Camera Body, Great Cosmetic", price: $(129), shipping: $(9.5), condition: "Used", conditionGrade: "VERY_GOOD", buyingOption: "FIXED_PRICE", daysAgo: 70 },
    ],
    vocabulary: { aspects: ["Brand: Canon", "Model: AE-1 Program", "Film Format: 35mm", "Type: SLR", "Focus Type: Manual", "Features: Built-in Light Meter"], categories: ["Film Cameras", "Camera Lenses"] },
    copy: {
      title: "Canon AE-1 Program 35mm SLR Film Camera with FD 50mm f/1.8 Lens",
      seoTitle: "Canon AE-1 Program 35mm Film SLR Camera + FD 50mm f/1.8 Lens, Black Chrome, Untested",
      intro: [
        "A Canon AE-1 Program 35mm SLR with the standard Canon FD 50mm f/1.8 lens and a neck strap. The body is black and chrome with the classic 'PROGRAM' front plate.",
        "The AE-1 Program is a manual-focus 35mm camera with a built-in light meter. This one is being sold as untested: I have not run film through it or checked the meter.",
      ],
      persuasiveIntro: "A clean Canon AE-1 Program paired with the FD 50mm f/1.8 — the setup most people start film photography with, ready for a new roll.",
      bullets: ["Canon AE-1 Program body, black and chrome", "Canon FD 50mm f/1.8 manual-focus lens", "35mm film format, built-in light meter", "Neck strap included", "Untested — sold as-is for shutter and meter"],
      keywords: ["Canon AE-1 Program", "35mm film camera", "Canon FD 50mm", "manual focus SLR", "film photography", "vintage camera", "AE1", "FD mount"],
      specifics: [
        { name: "Brand", value: "Canon" },
        { name: "Model", value: "AE-1 Program" },
        { name: "Type", value: "SLR" },
        { name: "Film Format", value: "35mm" },
        { name: "Color", value: "Black and chrome" },
        { name: "Focus Type", value: "Manual" },
      ],
      suggestedCategoryPath: ["Cameras & Photo", "Film Photography", "Film Cameras"],
    },
  },

  // ───────────────────────── 2. Mechanical keyboard ─────────────────────────
  {
    slug: "keychron-k2-v2",
    keywords: ["keyboard", "keychron", "mechanical", "k2", "gateron", "cherry", "hot-swappable", "hotswap"],
    profile: {
      itemName: f("Keychron K2 (Version 2) wireless mechanical keyboard", 0.9, 1, "Keychron logo on the space bar; K2 layout (75%, 84 keys)"),
      brand: f("Keychron", 0.98, 1, "Logo printed on the case and the space bar"),
      model: f("K2 V2", 0.86, 4, "Underside label reads 'K2 Version 2'"),
      modelNumber: f("K2-C3", 0.66, 4, "Partial model code on the underside label; last character hard to read"),
      categoryPath: ["Computers, Tablets & Networking", "Keyboards, Mice & Pointers", "Keyboards & Keypads"],
      categoryConfidence: 0.98,
      color: f("Dark grey with grey and orange keycaps", 0.95, 1),
      material: f("Plastic case", 0.8, 3, "No aluminium frame edges visible"),
      size: f("75% layout, 84 keys", 0.92, 1),
      dimensions: null,
      approximateAge: null,
      attributes: [
        attr("Switch type", "Gateron Brown", 0.72, 2, "Brown switch stems visible with one keycap removed"),
        attr("Backlight", "RGB", 0.9, 2, "Multi-colour backlight lit in photo 2"),
        attr("Connectivity", "Bluetooth and USB-C", 0.85, 4, "Bluetooth toggle switch on the left edge; USB-C port"),
        attr("Hot-swappable", "Unknown from photos", 0.4, null, "Cannot tell hot-swap PCB from the photos"),
      ],
      accessoriesIncluded: ["USB-C cable", "Keycap puller"],
      possiblyMissing: ["Retail box not shown", "Extra Mac/Windows keycaps not shown"],
      condition: {
        grade: "VERY_GOOD",
        confidence: 0.85,
        tier: "CONFIDENT",
        summary: "Keycaps show light shine on the space bar and WASD area from normal use. Case is clean with no cracks; the legend printing is intact.",
        defects: [{ type: "wear", location: "Space bar and WASD keycaps", severity: "minor", description: "Light shine from use", evidenceImage: 1 }],
        functionalStatus: "powers_on",
      },
      identityConfidence: 0.9,
      identityTier: "CONFIDENT",
      alternativeIdentifications: [],
      unknowns: ["Whether the PCB is hot-swappable", "Battery health (wireless runtime)", "Whether every key registers"],
      needsMorePhotos: ["label_closeup", "ports"],
      searchKeywords: ["Keychron K2", "Keychron K2 V2", "wireless mechanical keyboard", "Gateron Brown", "75% keyboard", "RGB keyboard"],
      barcodeVisible: null,
      notes: null,
    },
    comps: [
      { title: "Keychron K2 V2 Wireless Mechanical Keyboard Gateron Brown RGB 75%", price: $(59), shipping: 0, condition: "Used", conditionGrade: "VERY_GOOD", buyingOption: "FIXED_PRICE", daysAgo: 4 },
      { title: "Keychron K2 Version 2 RGB Hot-swappable Mechanical Keyboard Brown", price: $(72), shipping: $(8), condition: "Used", conditionGrade: "LIKE_NEW", buyingOption: "BEST_OFFER", daysAgo: 11 },
      { title: "Keychron K2 wireless mechanical keyboard 84 key Gateron red", price: $(48), shipping: $(9.5), condition: "Used", conditionGrade: "GOOD", buyingOption: "FIXED_PRICE", daysAgo: 25 },
      { title: "Keychron K2 V2 Mechanical Keyboard - Gateron Brown - RGB - Aluminum Frame", price: $(79), shipping: 0, condition: "Used", conditionGrade: "VERY_GOOD", buyingOption: "FIXED_PRICE", daysAgo: 7 },
      { title: "Keychron K2 (V2) 75% Wireless Mechanical Keyboard Gateron Brown RGB backlit", price: $(55), shipping: $(7), condition: "Used", conditionGrade: "VERY_GOOD", buyingOption: "AUCTION", daysAgo: 1 },
      { title: "NEW Keychron K2 V2 Gateron G Pro Brown RGB Hot Swap Wireless Mechanical Keyboard", price: $(89), shipping: 0, condition: "New", conditionGrade: "NEW_SEALED", buyingOption: "FIXED_PRICE", daysAgo: 18 },
      { title: "Keychron K2 Wireless Mechanical Keyboard RGB Gateron Brown - tested", price: $(62), shipping: $(6.5), condition: "Used", conditionGrade: "VERY_GOOD", buyingOption: "FIXED_PRICE", daysAgo: 33, soldDaysAgo: 6 },
      { title: "Keychron K2 v2 mechanical keyboard - missing keycaps, for parts", price: $(22), shipping: $(8), condition: "For parts or not working", conditionGrade: "FOR_PARTS", buyingOption: "FIXED_PRICE", daysAgo: 9 },
      { title: "Logitech G Pro X mechanical gaming keyboard tenkeyless", price: $(65), shipping: 0, condition: "Used", conditionGrade: "VERY_GOOD", buyingOption: "FIXED_PRICE", daysAgo: 5 },
      { title: "Keychron K2 V2 Wireless Mechanical Keyboard, Gateron Brown, RGB, Mac Windows", price: $(66), shipping: $(5), condition: "Used", conditionGrade: "VERY_GOOD", buyingOption: "BEST_OFFER", daysAgo: 48 },
      { title: "Keychron K2 75% wireless mechanical keyboard white backlight brown", price: $(45), shipping: $(9), condition: "Used", conditionGrade: "GOOD", buyingOption: "FIXED_PRICE", daysAgo: 60 },
    ],
    vocabulary: { aspects: ["Brand: Keychron", "Model: K2", "Connectivity: Bluetooth Wireless", "Layout: 75%", "Switch: Gateron Brown", "Features: RGB Backlit"], categories: ["Keyboards & Keypads"] },
    copy: {
      title: "Keychron K2 V2 Wireless Mechanical Keyboard, Gateron Brown, RGB, 75%",
      seoTitle: "Keychron K2 V2 75% Wireless Mechanical Keyboard RGB Gateron Brown Mac Windows",
      intro: [
        "A Keychron K2 (Version 2) compact 75% mechanical keyboard with RGB backlighting and Gateron Brown switches. Dark grey case with grey and orange keycaps.",
        "Connects over Bluetooth or the included USB-C cable. It powers on and the backlight works; I have not tested every key individually.",
      ],
      persuasiveIntro: "The Keychron K2 V2 fits a full 84-key layout into a desk-friendly 75% footprint, with tactile Gateron Brown switches and RGB backlighting — a well-kept board for a fraction of the new price.",
      bullets: ["Keychron K2, Version 2, 75% layout (84 keys)", "Gateron Brown tactile switches", "RGB backlight", "Bluetooth and wired USB-C", "Includes USB-C cable and keycap puller"],
      keywords: ["Keychron K2", "mechanical keyboard", "wireless keyboard", "Gateron Brown", "RGB", "75% keyboard", "Mac keyboard", "hot swap"],
      specifics: [
        { name: "Brand", value: "Keychron" },
        { name: "Model", value: "K2 V2" },
        { name: "Connectivity", value: "Bluetooth and USB-C" },
        { name: "Switch Type", value: "Gateron Brown" },
        { name: "Layout", value: "75% (84 keys)" },
        { name: "Color", value: "Dark grey" },
      ],
      suggestedCategoryPath: ["Computers, Tablets & Networking", "Keyboards, Mice & Pointers", "Keyboards & Keypads"],
    },
  },

  // ───────────────────────── 3. Designer handbag ─────────────────────────
  {
    slug: "coach-tabby-26",
    keywords: ["handbag", "bag", "purse", "coach", "tabby", "leather", "designer", "shoulder", "crossbody", "louis", "gucci", "prada"],
    profile: {
      itemName: f("Coach Tabby 26 shoulder bag, black pebbled leather", 0.78, 1, "Signature Tabby turnlock and shape; size inferred from proportions"),
      brand: f("Coach", 0.96, 3, "Interior creed patch reads 'Coach'"),
      model: f("Tabby 26", 0.7, 1, "Tabby silhouette; 26 vs 20 size judged from strap proportions, not measured"),
      modelNumber: f("C0772", 0.62, 3, "Creed patch style number partially legible"),
      categoryPath: ["Clothing, Shoes & Accessories", "Women", "Women's Bags & Handbags"],
      categoryConfidence: 0.97,
      color: f("Black", 0.98, 1),
      material: f("Pebbled leather", 0.88, 2, "Pebble grain visible in the close-up"),
      size: null,
      dimensions: null,
      approximateAge: null,
      attributes: [
        attr("Hardware", "Brass tone", 0.9, 1),
        attr("Strap", "Detachable leather shoulder strap", 0.85, 1),
        attr("Closure", "Turnlock", 0.95, 1),
      ],
      accessoriesIncluded: ["Detachable shoulder strap"],
      possiblyMissing: ["Dust bag not shown", "Retail tag not shown", "Chain strap not shown (sold with some versions)"],
      condition: {
        grade: "GOOD",
        confidence: 0.8,
        tier: "LIKELY",
        summary: "Leather is supple with minor corner wear at two bottom corners and light scratching on the turnlock. The interior lining is clean in the photo shown.",
        defects: [
          { type: "wear", location: "Two bottom corners", severity: "minor", description: "Light corner rubbing, no colour loss beyond the edge paint", evidenceImage: 2 },
          { type: "scratch", location: "Turnlock hardware", severity: "minor", description: "Fine surface scratches on the brass", evidenceImage: 1 },
        ],
        functionalStatus: "not_applicable",
      },
      identityConfidence: 0.76,
      identityTier: "LIKELY",
      alternativeIdentifications: [
        { itemName: "Coach Tabby 26 shoulder bag", brand: "Coach", model: "Tabby 26", likelihood: 0.62 },
        { itemName: "Coach Tabby 20 shoulder bag", brand: "Coach", model: "Tabby 20", likelihood: 0.28 },
        { itemName: "Coach Pillow Tabby 26", brand: "Coach", model: "Pillow Tabby 26", likelihood: 0.1 },
      ],
      unknowns: ["Exact width in cm (26 vs 20 size)", "Authenticity has not been verified", "Whether the dust bag is included"],
      needsMorePhotos: ["inside", "label_closeup", "back"],
      searchKeywords: ["Coach Tabby 26", "Coach Tabby shoulder bag black", "Coach pebbled leather Tabby", "Coach C0772", "Tabby 26 black brass"],
      barcodeVisible: null,
      notes: "Measure the width across the base: Tabby 26 is about 26 cm, Tabby 20 about 20 cm.",
    },
    escalated: {
      identityConfidence: 0.88,
      identityTier: "CONFIDENT",
      model: f("Tabby 26", 0.88, 3, "Creed style number C0772 corresponds to the Tabby 26 in black"),
      alternativeIdentifications: [{ itemName: "Coach Tabby 20 shoulder bag", brand: "Coach", model: "Tabby 20", likelihood: 0.1 }],
    },
    comps: [
      { title: "Coach Tabby Shoulder Bag 26 Black Pebbled Leather Brass C0772", price: $(245), shipping: 0, condition: "Pre-owned", conditionGrade: "VERY_GOOD", buyingOption: "BEST_OFFER", daysAgo: 5 },
      { title: "COACH Tabby 26 shoulder bag black leather - excellent condition", price: $(289), shipping: $(12), condition: "Pre-owned", conditionGrade: "LIKE_NEW", buyingOption: "FIXED_PRICE", daysAgo: 12 },
      { title: "Coach Tabby 26 Black Pebble Leather Shoulder Bag with dust bag", price: $(215), shipping: $(14.5), condition: "Pre-owned", conditionGrade: "GOOD", buyingOption: "FIXED_PRICE", daysAgo: 2 },
      { title: "Coach Tabby Shoulder Bag 26 in Black - corner wear", price: $(179), shipping: $(12), condition: "Pre-owned", conditionGrade: "GOOD", buyingOption: "AUCTION", daysAgo: 1 },
      { title: "Coach Tabby 26 black brass hardware pebbled leather shoulder bag", price: $(230), shipping: 0, condition: "Pre-owned", conditionGrade: "VERY_GOOD", buyingOption: "FIXED_PRICE", daysAgo: 27, soldDaysAgo: 3 },
      { title: "NWT Coach Tabby Shoulder Bag 26 Black Pebbled Leather", price: $(339), shipping: 0, condition: "New with tags", conditionGrade: "NEW_SEALED", buyingOption: "FIXED_PRICE", daysAgo: 8 },
      { title: "Coach Tabby 20 black leather shoulder bag brass", price: $(195), shipping: $(10), condition: "Pre-owned", conditionGrade: "VERY_GOOD", buyingOption: "FIXED_PRICE", daysAgo: 15 },
      { title: "Coach Tabby 26 Shoulder Bag Black - light use, strap included", price: $(255), shipping: $(9.99), condition: "Pre-owned", conditionGrade: "VERY_GOOD", buyingOption: "BEST_OFFER", daysAgo: 36 },
      { title: "Coach Pillow Tabby 26 black quilted leather", price: $(310), shipping: 0, condition: "Pre-owned", conditionGrade: "LIKE_NEW", buyingOption: "FIXED_PRICE", daysAgo: 6 },
      { title: "Michael Kors Jet Set black saffiano leather shoulder bag", price: $(85), shipping: $(9), condition: "Pre-owned", conditionGrade: "VERY_GOOD", buyingOption: "FIXED_PRICE", daysAgo: 4 },
      { title: "Coach Tabby 26 shoulder bag black pebbled leather - authentic", price: $(199), shipping: $(12), condition: "Pre-owned", conditionGrade: "GOOD", buyingOption: "FIXED_PRICE", daysAgo: 50, soldDaysAgo: 20 },
      { title: "Coach Tabby shoulder bag 26 black with chain strap", price: $(270), shipping: $(11), condition: "Pre-owned", conditionGrade: "VERY_GOOD", buyingOption: "FIXED_PRICE", daysAgo: 20 },
    ],
    vocabulary: { aspects: ["Brand: Coach", "Style: Shoulder Bag", "Color: Black", "Material: Leather", "Line: Tabby", "Hardware Color: Brass"], categories: ["Women's Bags & Handbags"] },
    copy: {
      title: "Coach Tabby 26 Shoulder Bag, Black Pebbled Leather, Brass Turnlock",
      seoTitle: "Coach Tabby 26 Shoulder Bag Black Pebbled Leather Brass Hardware C0772 Turnlock",
      intro: [
        "A Coach Tabby 26 shoulder bag in black pebbled leather with brass-tone hardware and the signature turnlock closure. Comes with the detachable leather shoulder strap.",
        "The creed patch inside reads Coach with style number C0772. Authenticity has not been independently verified; please review the close-up photos.",
      ],
      persuasiveIntro: "Coach's Tabby 26 in the most versatile combination — black pebbled leather with brass turnlock — carried gently and ready for daily use.",
      bullets: ["Coach Tabby 26, black pebbled leather", "Brass-tone turnlock closure", "Detachable leather shoulder strap included", "Creed patch with style number C0772", "Minor corner wear disclosed below"],
      keywords: ["Coach Tabby", "Tabby 26", "Coach shoulder bag", "black leather bag", "pebbled leather", "designer handbag", "brass turnlock", "C0772"],
      specifics: [
        { name: "Brand", value: "Coach" },
        { name: "Model", value: "Tabby 26" },
        { name: "Style", value: "Shoulder bag" },
        { name: "Color", value: "Black" },
        { name: "Material", value: "Pebbled leather" },
        { name: "Hardware", value: "Brass tone" },
      ],
      suggestedCategoryPath: ["Clothing, Shoes & Accessories", "Women", "Women's Bags & Handbags"],
    },
  },

  // ───────────────────────── 4. Road bike ─────────────────────────
  {
    slug: "trek-domane-al2",
    keywords: ["bike", "bicycle", "road bike", "trek", "domane", "specialized", "cannondale", "giant", "cycling", "shimano"],
    profile: {
      itemName: f("Trek Domane AL 2 road bike, 56 cm, Shimano Claris", 0.88, 1, "'Domane AL 2' decal on the down tube; Claris levers"),
      brand: f("Trek", 0.99, 1, "Trek logo on the down tube and head badge"),
      model: f("Domane AL 2", 0.9, 1, "Model decal on the top tube"),
      modelNumber: null,
      categoryPath: ["Sporting Goods", "Cycling", "Bicycles"],
      categoryConfidence: 0.99,
      color: f("Matte black with red accents", 0.96, 1),
      material: f("Aluminium frame, carbon fork", 0.8, 2, "'Alpha Aluminum' and 'Carbon' decals visible"),
      size: f("56 cm", 0.68, 3, "Size sticker on the seat tube partly obscured"),
      dimensions: null,
      approximateAge: f("2020–2022", 0.6, null, "Based on the paint scheme; not read from a serial"),
      attributes: [
        attr("Groupset", "Shimano Claris 2×8", 0.87, 2, "Claris rear derailleur legible"),
        attr("Wheel size", "700c", 0.9, 1),
        attr("Brakes", "Rim brakes (dual pivot)", 0.9, 1),
        attr("Pedals", "Flat pedals fitted", 0.9, 1),
      ],
      accessoriesIncluded: ["Flat pedals", "Bottle cage"],
      possiblyMissing: ["Manual not shown", "Reflectors not shown"],
      condition: {
        grade: "GOOD",
        confidence: 0.78,
        tier: "LIKELY",
        summary: "The frame shows chain-slap marks on the drive-side chainstay and a chip on the top tube. Tyres have visible tread; drivetrain wear cannot be judged from the photos.",
        defects: [
          { type: "scratch", location: "Drive-side chainstay", severity: "minor", description: "Chain-slap marks through the paint", evidenceImage: 2 },
          { type: "scuff", location: "Top tube near the head tube", severity: "moderate", description: "Paint chip about 5 mm, no dent visible", evidenceImage: 3 },
        ],
        functionalStatus: "untested",
      },
      identityConfidence: 0.88,
      identityTier: "CONFIDENT",
      alternativeIdentifications: [],
      unknowns: ["Frame size from the sticker (56 cm assumed)", "Chain and cassette wear", "Whether the gears index cleanly", "Serial number under the bottom bracket"],
      needsMorePhotos: ["serial_number", "underside", "defect_closeup"],
      searchKeywords: ["Trek Domane AL 2", "Domane AL2 56cm", "Trek road bike Claris", "aluminum road bike 56", "Trek Domane"],
      barcodeVisible: null,
      notes: null,
    },
    comps: [
      { title: "Trek Domane AL 2 Road Bike 56cm Shimano Claris Matte Black 2021", price: $(650), shipping: 0, condition: "Used", conditionGrade: "VERY_GOOD", buyingOption: "FIXED_PRICE", daysAgo: 9 },
      { title: "Trek Domane AL 2 56 cm road bike aluminum Claris 2x8 - local pickup", price: $(540), shipping: 0, condition: "Used", conditionGrade: "GOOD", buyingOption: "BEST_OFFER", daysAgo: 3 },
      { title: "2022 Trek Domane AL 2 Disc road bike 56cm", price: $(720), shipping: 0, condition: "Used", conditionGrade: "VERY_GOOD", buyingOption: "FIXED_PRICE", daysAgo: 16 },
      { title: "Trek Domane AL 2 road bicycle 54cm Claris black", price: $(495), shipping: $(89), condition: "Used", conditionGrade: "GOOD", buyingOption: "FIXED_PRICE", daysAgo: 22 },
      { title: "Trek Domane AL 2 Road Bike - 56cm - Shimano Claris - great condition", price: $(600), shipping: 0, condition: "Used", conditionGrade: "VERY_GOOD", buyingOption: "AUCTION", daysAgo: 2 },
      { title: "Trek Domane AL 3 road bike 56cm Sora 2x9", price: $(825), shipping: 0, condition: "Used", conditionGrade: "VERY_GOOD", buyingOption: "FIXED_PRICE", daysAgo: 7 },
      { title: "Trek Domane AL 2 58cm aluminum road bike Claris, new tires", price: $(575), shipping: 0, condition: "Used", conditionGrade: "GOOD", buyingOption: "BEST_OFFER", daysAgo: 30, soldDaysAgo: 8 },
      { title: "Trek Domane AL 2 56cm 2020 road bike black red Claris", price: $(520), shipping: 0, condition: "Used", conditionGrade: "GOOD", buyingOption: "FIXED_PRICE", daysAgo: 44 },
      { title: "Giant Contend 3 road bike M/L Claris", price: $(450), shipping: 0, condition: "Used", conditionGrade: "GOOD", buyingOption: "FIXED_PRICE", daysAgo: 5 },
      { title: "Trek Domane AL 2 Gen 3 road bike 56 - barely ridden", price: $(780), shipping: 0, condition: "Used", conditionGrade: "LIKE_NEW", buyingOption: "FIXED_PRICE", daysAgo: 12 },
    ],
    vocabulary: { aspects: ["Brand: Trek", "Model: Domane AL 2", "Type: Road Bike", "Frame Size: 56 cm", "Frame Material: Aluminium", "Wheel Size: 700c", "Number of Gears: 16"], categories: ["Bicycles"] },
    copy: {
      title: "Trek Domane AL 2 Road Bike, 56 cm, Shimano Claris 2×8, Matte Black",
      seoTitle: "Trek Domane AL 2 56cm Aluminum Road Bike Shimano Claris 2x8 Carbon Fork Matte Black",
      intro: [
        "A Trek Domane AL 2 endurance road bike in matte black with red accents. Alpha Aluminum frame with a carbon fork, Shimano Claris 2×8 drivetrain, dual-pivot rim brakes and 700c wheels.",
        "Fitted with flat pedals and a bottle cage. The seat-tube size sticker is partly obscured; it reads as 56 cm.",
      ],
      persuasiveIntro: "Trek's Domane AL 2 is built for long, comfortable miles — an aluminium endurance frame with a vibration-damping carbon fork and dependable Shimano Claris shifting, at a fraction of its new price.",
      bullets: ["Trek Domane AL 2, 56 cm frame", "Aluminium frame with carbon fork", "Shimano Claris 2×8 drivetrain", "Dual-pivot rim brakes, 700c wheels", "Flat pedals and bottle cage included"],
      keywords: ["Trek Domane", "Domane AL 2", "road bike 56cm", "Shimano Claris", "aluminum road bike", "endurance bike", "Trek bike", "carbon fork"],
      specifics: [
        { name: "Brand", value: "Trek" },
        { name: "Model", value: "Domane AL 2" },
        { name: "Type", value: "Road bike" },
        { name: "Frame Size", value: "56 cm" },
        { name: "Frame Material", value: "Aluminium" },
        { name: "Color", value: "Matte black" },
      ],
      suggestedCategoryPath: ["Sporting Goods", "Cycling", "Bicycles"],
    },
  },

  // ───────────────────────── 5. KitchenAid mixer ─────────────────────────
  {
    slug: "kitchenaid-artisan",
    keywords: ["mixer", "kitchenaid", "stand mixer", "artisan", "kitchen", "appliance", "blender", "cuisinart"],
    profile: {
      itemName: f("KitchenAid Artisan 5-quart tilt-head stand mixer, Empire Red", 0.95, 1, "'KitchenAid Artisan' badge on the front; red gloss finish"),
      brand: f("KitchenAid", 0.99, 1, "Badge on the motor head"),
      model: f("Artisan KSM150PS", 0.9, 4, "Underside label reads 'KSM150PSER'"),
      modelNumber: f("KSM150PSER", 0.88, 4, "Underside rating label"),
      categoryPath: ["Home & Garden", "Kitchen, Dining & Bar", "Small Kitchen Appliances", "Mixers"],
      categoryConfidence: 0.99,
      color: f("Empire Red", 0.93, 1, "Colour code ER on the label"),
      material: f("Metal body", 0.9, 1),
      size: f("5 quart", 0.92, 4, "Capacity on the label"),
      dimensions: null,
      approximateAge: null,
      attributes: [
        attr("Type", "Tilt-head", 0.97, 1),
        attr("Wattage", "325 W", 0.85, 4, "Rating label"),
        attr("Bowl", "Stainless steel with handle", 0.95, 2),
        attr("Voltage", "120 V", 0.9, 4),
      ],
      accessoriesIncluded: ["Stainless steel bowl", "Flat beater", "Dough hook", "Wire whip", "Pouring shield"],
      possiblyMissing: ["Retail box not shown", "Manual not shown"],
      condition: {
        grade: "VERY_GOOD",
        confidence: 0.86,
        tier: "CONFIDENT",
        summary: "Glossy finish with a small chip on the rear of the base and faint scratches on the bowl exterior. The mixer was photographed running, so it powers on and the head locks.",
        defects: [
          { type: "damage", location: "Rear of base", severity: "minor", description: "Paint chip about 3 mm exposing metal, no rust", evidenceImage: 3 },
          { type: "scratch", location: "Bowl exterior", severity: "minor", description: "Faint surface scratches from storage", evidenceImage: 2 },
        ],
        functionalStatus: "powers_on",
      },
      identityConfidence: 0.95,
      identityTier: "CONFIDENT",
      alternativeIdentifications: [],
      unknowns: ["Whether all ten speeds work smoothly", "Year of manufacture (serial number not photographed)"],
      needsMorePhotos: ["serial_number", "accessories"],
      searchKeywords: ["KitchenAid Artisan 5 quart", "KSM150PS", "KitchenAid stand mixer red", "Empire Red mixer", "tilt-head stand mixer"],
      barcodeVisible: null,
      notes: null,
    },
    comps: [
      { title: "KitchenAid Artisan 5 Qt Tilt-Head Stand Mixer KSM150PSER Empire Red w/ attachments", price: $(219), shipping: 0, condition: "Used", conditionGrade: "VERY_GOOD", buyingOption: "FIXED_PRICE", daysAgo: 4 },
      { title: "KitchenAid KSM150PS Artisan 5-Quart Stand Mixer Empire Red - tested works", price: $(199), shipping: $(24.9), condition: "Used", conditionGrade: "GOOD", buyingOption: "BEST_OFFER", daysAgo: 10 },
      { title: "KitchenAid Artisan Series 5 Quart Tilt Head Stand Mixer Red KSM150 bowl beater whisk hook", price: $(235), shipping: $(19.99), condition: "Used", conditionGrade: "VERY_GOOD", buyingOption: "FIXED_PRICE", daysAgo: 1 },
      { title: "KitchenAid Artisan 5qt stand mixer Empire Red KSM150PSER excellent", price: $(259), shipping: 0, condition: "Used", conditionGrade: "LIKE_NEW", buyingOption: "FIXED_PRICE", daysAgo: 19 },
      { title: "KitchenAid Artisan 5-Qt Stand Mixer, Empire Red - NEW open box", price: $(299), shipping: 0, condition: "Open box", conditionGrade: "NEW_OPEN_BOX", buyingOption: "FIXED_PRICE", daysAgo: 6 },
      { title: "KitchenAid Artisan KSM150PS 5 qt mixer red - motor runs, cosmetic wear", price: $(165), shipping: $(29), condition: "Used", conditionGrade: "FAIR", buyingOption: "AUCTION", daysAgo: 2 },
      { title: "KitchenAid Artisan 5 quart tilt-head stand mixer Empire Red with pouring shield", price: $(210), shipping: $(22), condition: "Used", conditionGrade: "VERY_GOOD", buyingOption: "FIXED_PRICE", daysAgo: 28, soldDaysAgo: 5 },
      { title: "KitchenAid Classic Plus 4.5 qt stand mixer white K45SS", price: $(129), shipping: $(25), condition: "Used", conditionGrade: "GOOD", buyingOption: "FIXED_PRICE", daysAgo: 8 },
      { title: "KitchenAid Artisan 5Qt Stand Mixer Empire Red KSM150PSER", price: $(189), shipping: $(26.5), condition: "Used", conditionGrade: "GOOD", buyingOption: "FIXED_PRICE", daysAgo: 41 },
      { title: "KitchenAid Artisan stand mixer 5 quart red - FOR PARTS grinding noise", price: $(75), shipping: $(30), condition: "For parts or not working", conditionGrade: "FOR_PARTS", buyingOption: "FIXED_PRICE", daysAgo: 13 },
      { title: "KitchenAid Artisan 5 Quart Stand Mixer KSM150PSER Empire Red, all attachments", price: $(229), shipping: 0, condition: "Used", conditionGrade: "VERY_GOOD", buyingOption: "BEST_OFFER", daysAgo: 52, soldDaysAgo: 24 },
      { title: "KitchenAid Artisan Tilt-Head Stand Mixer 5 Qt Empire Red", price: $(245), shipping: $(15), condition: "Used", conditionGrade: "VERY_GOOD", buyingOption: "FIXED_PRICE", daysAgo: 23 },
    ],
    vocabulary: { aspects: ["Brand: KitchenAid", "Model: KSM150PS", "Capacity: 5 qt", "Color: Empire Red", "Type: Stand Mixer", "Power: 325 W"], categories: ["Mixers (Countertop)", "Small Kitchen Appliances"] },
    copy: {
      title: "KitchenAid Artisan 5-Quart Tilt-Head Stand Mixer KSM150PS, Empire Red",
      seoTitle: "KitchenAid Artisan KSM150PSER 5 Qt Tilt-Head Stand Mixer Empire Red 325W Bowl Beater Hook Whip",
      intro: [
        "A KitchenAid Artisan 5-quart tilt-head stand mixer in Empire Red, model KSM150PSER. The rating label reads 325 W, 120 V.",
        "Includes the stainless steel bowl with handle, flat beater, dough hook, wire whip and pouring shield. It powers on and the head locks down as shown in the photos.",
      ],
      persuasiveIntro: "The mixer every kitchen wants — a KitchenAid Artisan 5-quart in Empire Red with all five standard attachments, powered on and ready for the next batch of dough.",
      bullets: ["KitchenAid Artisan, model KSM150PSER", "5-quart stainless steel bowl with handle", "Tilt-head design, 325 W motor", "Flat beater, dough hook, wire whip and pouring shield", "Powers on; small paint chip disclosed below"],
      keywords: ["KitchenAid Artisan", "KSM150PS", "stand mixer", "5 quart mixer", "Empire Red", "tilt-head mixer", "KitchenAid red", "kitchen appliance"],
      specifics: [
        { name: "Brand", value: "KitchenAid" },
        { name: "Model", value: "KSM150PSER" },
        { name: "Type", value: "Stand mixer" },
        { name: "Capacity", value: "5 quart" },
        { name: "Color", value: "Empire Red" },
        { name: "Power", value: "325 W" },
      ],
      suggestedCategoryPath: ["Home & Garden", "Kitchen, Dining & Bar", "Small Kitchen Appliances", "Mixers"],
    },
  },

  // ───────────────────────── 6. Vintage denim jacket ─────────────────────────
  {
    slug: "levis-type-iii-trucker",
    keywords: ["jacket", "denim", "levi", "levis", "levi's", "trucker", "vintage", "jean jacket", "wrangler", "lee"],
    profile: {
      itemName: f("Levi's Type III denim trucker jacket, vintage", 0.58, 1, "Two-pointed-pocket Type III cut; red tab reads 'Levi's'"),
      brand: f("Levi's", 0.95, 2, "Red tab and leather patch"),
      model: f("70505", 0.5, 3, "Care tag lot number faded; 70505 or 70506"),
      modelNumber: null,
      categoryPath: ["Clothing, Shoes & Accessories", "Men", "Men's Clothing", "Coats, Jackets & Vests"],
      categoryConfidence: 0.98,
      color: f("Medium-wash indigo blue", 0.96, 1),
      material: f("Denim (cotton)", 0.9, 1),
      size: f("42 (estimated)", 0.35, null, "Size tag not legible; estimated from proportions only"),
      dimensions: null,
      approximateAge: f("1970s–1980s", 0.55, 3, "Care tag style suggests 1970s–80s; lot number unclear"),
      attributes: [
        attr("Closure", "Metal button front", 0.96, 1),
        attr("Pockets", "Two chest pockets with pointed flaps", 0.95, 1),
        attr("Made in", "Unknown", 0.3, null, "Tag text too faded to read"),
      ],
      accessoriesIncluded: [],
      possiblyMissing: [],
      condition: {
        grade: "GOOD",
        confidence: 0.8,
        tier: "LIKELY",
        summary: "Honest vintage wear with fading at the seams and a small hole near the left cuff. No stains visible; all buttons appear present.",
        defects: [
          { type: "tear", location: "Left cuff", severity: "moderate", description: "Small hole about 1 cm at the cuff seam", evidenceImage: 4 },
          { type: "wear", location: "Collar and seams", severity: "minor", description: "Fading and whiskering consistent with age", evidenceImage: 1 },
        ],
        functionalStatus: "not_applicable",
      },
      identityConfidence: 0.58,
      identityTier: "NEEDS_CHECK",
      alternativeIdentifications: [
        { itemName: "Levi's 70505 Type III trucker jacket (1967–1971)", brand: "Levi's", model: "70505", likelihood: 0.4 },
        { itemName: "Levi's 70506 Type III trucker jacket (1970s–80s)", brand: "Levi's", model: "70506", likelihood: 0.38 },
        { itemName: "Levi's 71506 Type III trucker jacket", brand: "Levi's", model: "71506", likelihood: 0.22 },
      ],
      unknowns: ["Size (tag not legible — measure pit to pit)", "Lot number (70505 vs 70506)", "Country of manufacture", "Pit-to-pit and sleeve measurements"],
      needsMorePhotos: ["size_tag", "label_closeup", "inside", "back"],
      searchKeywords: ["Levi's Type III trucker jacket", "Levis 70505", "Levis 70506", "vintage Levi's denim jacket", "Levi's jean jacket 42"],
      barcodeVisible: null,
      notes: "A clear photo of the care tag and the button back would settle the lot number and decade.",
    },
    escalated: {
      identityConfidence: 0.82,
      identityTier: "LIKELY",
      itemName: f("Levi's 70506 Type III denim trucker jacket, 1980s", 0.82, 3, "Care tag layout with 'Levi Strauss & Co.' box matches late-1970s to 1980s 70506"),
      model: f("70506", 0.8, 3, "Lot number read as 70506 on the escalated pass"),
      approximateAge: f("1978–1989", 0.72, 3, "Care tag era"),
      alternativeIdentifications: [{ itemName: "Levi's 70505 Type III trucker jacket (1967–1971)", brand: "Levi's", model: "70505", likelihood: 0.15 }],
    },
    comps: [
      { title: "Vintage Levi's 70506 Type III Denim Trucker Jacket Men's 42 Made in USA 80s", price: $(85), shipping: $(9.99), condition: "Pre-owned", conditionGrade: "GOOD", buyingOption: "FIXED_PRICE", daysAgo: 6 },
      { title: "Levi's Type III trucker jacket 70505 Big E vintage 60s size 42", price: $(320), shipping: $(12), condition: "Pre-owned", conditionGrade: "GOOD", buyingOption: "BEST_OFFER", daysAgo: 12 },
      { title: "VTG 80s Levis 70506 0216 denim jean jacket trucker USA sz 44", price: $(69), shipping: $(11), condition: "Pre-owned", conditionGrade: "GOOD", buyingOption: "FIXED_PRICE", daysAgo: 3 },
      { title: "Vintage Levi's Type III denim trucker jacket medium wash 42 USA", price: $(95), shipping: $(10), condition: "Pre-owned", conditionGrade: "VERY_GOOD", buyingOption: "FIXED_PRICE", daysAgo: 20 },
      { title: "Levi's 70506 Type 3 trucker jacket vintage 1980s 40 distressed", price: $(58), shipping: $(9), condition: "Pre-owned", conditionGrade: "FAIR", buyingOption: "AUCTION", daysAgo: 1 },
      { title: "Vintage Levis Trucker Jacket 70506 Type III Denim 42 Regular 1980s", price: $(79), shipping: $(12.5), condition: "Pre-owned", conditionGrade: "GOOD", buyingOption: "FIXED_PRICE", daysAgo: 26, soldDaysAgo: 4 },
      { title: "Levi's Type III trucker denim jacket vintage 70506 size L 42", price: $(110), shipping: 0, condition: "Pre-owned", conditionGrade: "VERY_GOOD", buyingOption: "FIXED_PRICE", daysAgo: 9 },
      { title: "Wrangler vintage denim jacket 80s USA 42", price: $(45), shipping: $(9), condition: "Pre-owned", conditionGrade: "GOOD", buyingOption: "FIXED_PRICE", daysAgo: 4 },
      { title: "Vintage Levi's 70506 denim trucker jacket 42 - 80s USA - repaired cuff", price: $(65), shipping: $(10), condition: "Pre-owned", conditionGrade: "GOOD", buyingOption: "FIXED_PRICE", daysAgo: 38 },
      { title: "Levis Type III Trucker Jacket Vintage 70506 Medium Wash Denim 42", price: $(89), shipping: $(11), condition: "Pre-owned", conditionGrade: "GOOD", buyingOption: "BEST_OFFER", daysAgo: 62 },
    ],
    vocabulary: { aspects: ["Brand: Levi's", "Type: Denim Jacket", "Style: Trucker Jacket", "Size: 42", "Material: Denim", "Vintage: Yes", "Decade: 1980s"], categories: ["Coats, Jackets & Vests"] },
    copy: {
      title: "Vintage Levi's Type III Denim Trucker Jacket, Medium Wash Indigo",
      seoTitle: "Vintage Levi's Type III Trucker Denim Jacket 70506 Medium Wash Indigo 80s Jean Jacket",
      intro: [
        "A vintage Levi's Type III denim trucker jacket in medium-wash indigo with the classic two pointed-flap chest pockets and metal button front. Red tab and leather patch are present.",
        "The care tag is faded, so the lot number and size are not confirmed. Measurements are listed under unknowns; please ask for pit-to-pit before buying.",
      ],
      persuasiveIntro: "A genuinely worn-in vintage Levi's Type III trucker with the fading only decades can produce — the pattern every reproduction tries to copy.",
      bullets: ["Levi's Type III trucker jacket, vintage", "Medium-wash indigo cotton denim", "Two pointed-flap chest pockets, metal buttons", "Red tab and leather patch present", "Size tag not legible — see unknowns"],
      keywords: ["Levi's trucker jacket", "Type III", "vintage denim jacket", "jean jacket", "Levi's 70506", "80s Levi's", "medium wash", "indigo"],
      specifics: [
        { name: "Brand", value: "Levi's" },
        { name: "Type", value: "Denim jacket" },
        { name: "Style", value: "Trucker (Type III)" },
        { name: "Color", value: "Medium-wash indigo" },
        { name: "Material", value: "Denim (cotton)" },
      ],
      suggestedCategoryPath: ["Clothing, Shoes & Accessories", "Men", "Men's Clothing", "Coats, Jackets & Vests"],
    },
  },

  // ───────────────────────── 7. Nintendo Switch OLED ─────────────────────────
  {
    slug: "nintendo-switch-oled",
    keywords: ["switch", "nintendo", "console", "oled", "playstation", "ps5", "xbox", "video game", "joy-con", "joycon"],
    profile: {
      itemName: f("Nintendo Switch OLED model console, white Joy-Con", 0.96, 1, "OLED model with white dock and white Joy-Con; 'Nintendo Switch' on the dock"),
      brand: f("Nintendo", 0.99, 1),
      model: f("Switch OLED (HEG-001)", 0.94, 4, "Model number HEG-001 on the back label"),
      modelNumber: f("HEG-001", 0.94, 4, "Back label"),
      categoryPath: ["Video Games & Consoles", "Video Game Consoles"],
      categoryConfidence: 0.99,
      color: f("White", 0.98, 1),
      material: null,
      size: f("64 GB internal storage", 0.9, null, "Standard for the OLED model"),
      dimensions: null,
      approximateAge: f("2021 or later", 0.85, null, "OLED model launch year"),
      attributes: [
        attr("Storage", "64 GB", 0.9, null, "OLED model standard; not shown"),
        attr("Screen", "7-inch OLED", 0.95, 2, "Screen photographed on"),
        attr("Joy-Con", "White, pair", 0.97, 1),
        attr("Dock", "White OLED dock with LAN port", 0.93, 3),
      ],
      accessoriesIncluded: ["White dock", "Two Joy-Con controllers", "Joy-Con grip", "HDMI cable", "AC adapter"],
      possiblyMissing: ["Joy-Con wrist straps not shown", "Retail box not shown"],
      condition: {
        grade: "LIKE_NEW",
        confidence: 0.88,
        tier: "CONFIDENT",
        summary: "Screen shows no visible scratches in the photos and the Joy-Con have no discolouration. The dock has a faint scuff on the front edge.",
        defects: [{ type: "scuff", location: "Dock front edge", severity: "minor", description: "Faint scuff on the white plastic", evidenceImage: 3 }],
        functionalStatus: "powers_on",
      },
      identityConfidence: 0.96,
      identityTier: "CONFIDENT",
      alternativeIdentifications: [],
      unknowns: ["Whether the Joy-Con drift", "Battery health", "Whether the console is linked to a Nintendo account (must be signed out before sale)"],
      needsMorePhotos: ["accessories"],
      searchKeywords: ["Nintendo Switch OLED", "Switch OLED white", "HEG-001", "Nintendo Switch OLED console dock Joy-Con", "Switch OLED 64GB"],
      barcodeVisible: "045496882730",
      notes: null,
    },
    comps: [
      { title: "Nintendo Switch OLED Model White Joy-Con Console HEG-001 w/ Dock Complete", price: $(239), shipping: 0, condition: "Used", conditionGrade: "VERY_GOOD", buyingOption: "FIXED_PRICE", daysAgo: 2 },
      { title: "Nintendo Switch OLED 64GB White console with dock, joy cons, grip, cables - tested", price: $(225), shipping: $(12), condition: "Used", conditionGrade: "VERY_GOOD", buyingOption: "BEST_OFFER", daysAgo: 7 },
      { title: "Nintendo Switch OLED White - Like New - complete in box", price: $(269), shipping: 0, condition: "Used", conditionGrade: "LIKE_NEW", buyingOption: "FIXED_PRICE", daysAgo: 4 },
      { title: "Nintendo Switch OLED Model w/ White Joy-Con - console only, no dock", price: $(175), shipping: $(9.99), condition: "Used", conditionGrade: "GOOD", buyingOption: "FIXED_PRICE", daysAgo: 11 },
      { title: "Nintendo Switch OLED white HEG-001 with dock and 2 games", price: $(255), shipping: $(10), condition: "Used", conditionGrade: "VERY_GOOD", buyingOption: "AUCTION", daysAgo: 1 },
      { title: "Nintendo Switch OLED Model White Joy-Con Console - NEW SEALED", price: $(319), shipping: 0, condition: "New", conditionGrade: "NEW_SEALED", buyingOption: "FIXED_PRICE", daysAgo: 5 },
      { title: "Nintendo Switch OLED white console bundle dock joycon grip HDMI power", price: $(235), shipping: $(14), condition: "Used", conditionGrade: "VERY_GOOD", buyingOption: "FIXED_PRICE", daysAgo: 21, soldDaysAgo: 2 },
      { title: "Nintendo Switch OLED Model - White - screen scratch, works", price: $(189), shipping: $(12), condition: "Used", conditionGrade: "FAIR", buyingOption: "FIXED_PRICE", daysAgo: 9 },
      { title: "Nintendo Switch Lite Turquoise handheld console", price: $(129), shipping: $(9), condition: "Used", conditionGrade: "VERY_GOOD", buyingOption: "FIXED_PRICE", daysAgo: 3 },
      { title: "Nintendo Switch OLED White Complete HEG-001 Joy-Con Dock - excellent", price: $(249), shipping: $(8.5), condition: "Used", conditionGrade: "LIKE_NEW", buyingOption: "BEST_OFFER", daysAgo: 15 },
      { title: "Nintendo Switch OLED console white with dock & joycons", price: $(229), shipping: $(11), condition: "Used", conditionGrade: "VERY_GOOD", buyingOption: "FIXED_PRICE", daysAgo: 33, soldDaysAgo: 12 },
      { title: "Nintendo Switch OLED Model White 64GB HEG-001 - dock, Joy-Con, all cables", price: $(245), shipping: 0, condition: "Used", conditionGrade: "VERY_GOOD", buyingOption: "FIXED_PRICE", daysAgo: 27 },
      { title: "Nintendo Switch OLED white - Joy-Con drift, for parts or repair", price: $(140), shipping: $(12), condition: "For parts or not working", conditionGrade: "FOR_PARTS", buyingOption: "FIXED_PRICE", daysAgo: 6 },
      { title: "Lot of 2 Nintendo Switch OLED consoles white bundle", price: $(430), shipping: $(20), condition: "Used", conditionGrade: null, buyingOption: "FIXED_PRICE", daysAgo: 8 },
    ],
    vocabulary: { aspects: ["Brand: Nintendo", "Model: Nintendo Switch OLED", "Color: White", "Storage Capacity: 64 GB", "Type: Home Console", "Connectivity: Wi-Fi, Bluetooth"], categories: ["Video Game Consoles"] },
    copy: {
      title: "Nintendo Switch OLED Model Console, White Joy-Con, Dock, HEG-001",
      seoTitle: "Nintendo Switch OLED Model HEG-001 White Joy-Con Console 64GB Dock Grip HDMI Complete",
      intro: [
        "A Nintendo Switch OLED model (HEG-001) in white with the white dock, two Joy-Con controllers, Joy-Con grip, HDMI cable and AC adapter.",
        "The 7-inch OLED screen is shown powered on. The console will be signed out of any Nintendo account before it ships.",
      ],
      persuasiveIntro: "The OLED Switch with its 7-inch screen and wide-stand — kept in like-new shape with the dock, both Joy-Con and every cable you need to play tonight.",
      bullets: ["Nintendo Switch OLED model, HEG-001, white", "7-inch OLED screen, powers on", "White dock with LAN port", "Two white Joy-Con and grip", "HDMI cable and AC adapter included"],
      keywords: ["Nintendo Switch OLED", "Switch OLED white", "HEG-001", "Nintendo console", "Joy-Con", "Switch dock", "64GB", "handheld console"],
      specifics: [
        { name: "Brand", value: "Nintendo" },
        { name: "Model", value: "Switch OLED (HEG-001)" },
        { name: "Color", value: "White" },
        { name: "Storage", value: "64 GB" },
        { name: "Screen", value: "7-inch OLED" },
      ],
      suggestedCategoryPath: ["Video Games & Consoles", "Video Game Consoles"],
    },
  },

  // ───────────────────────── 8. Mid-century lamp ─────────────────────────
  {
    slug: "mcm-teak-tripod-lamp",
    keywords: ["lamp", "mid-century", "mid century", "mcm", "teak", "tripod", "lighting", "floor lamp", "table lamp", "danish"],
    profile: {
      itemName: f("Mid-century modern teak tripod floor lamp with linen drum shade", 0.7, 1, "Three turned wooden legs with brass ferrules; drum shade"),
      brand: null,
      model: null,
      modelNumber: null,
      categoryPath: ["Home & Garden", "Lamps, Lighting & Ceiling Fans", "Lamps"],
      categoryConfidence: 0.98,
      color: f("Warm brown wood, off-white shade", 0.95, 1),
      material: f("Teak (likely) with brass hardware", 0.62, 2, "Grain and colour consistent with teak; not verified"),
      size: null,
      dimensions: f("Approximately 150 cm tall", 0.45, 1, "Estimated against the door frame in photo 1"),
      approximateAge: f("1960s style (possibly a later reproduction)", 0.5, null, "No maker's mark visible"),
      attributes: [
        attr("Shade", "Linen drum shade", 0.85, 1),
        attr("Socket", "E26 standard", 0.6, 3, "Socket shape visible in photo 3"),
        attr("Switch", "Inline cord switch", 0.8, 3),
      ],
      accessoriesIncluded: ["Drum shade"],
      possiblyMissing: ["Bulb not shown"],
      condition: {
        grade: "GOOD",
        confidence: 0.76,
        tier: "LIKELY",
        summary: "Wood shows a few small dings on one leg and the shade has a faint yellowing on one side. The cord looks intact; the lamp was not photographed lit.",
        defects: [
          { type: "dent", location: "Front left leg", severity: "minor", description: "Two small dings in the finish", evidenceImage: 2 },
          { type: "discoloration", location: "Shade, one side", severity: "minor", description: "Faint yellowing from light exposure", evidenceImage: 1 },
        ],
        functionalStatus: "untested",
      },
      identityConfidence: 0.7,
      identityTier: "LIKELY",
      alternativeIdentifications: [
        { itemName: "Danish-style teak tripod floor lamp (unbranded, 1960s)", brand: null, model: null, likelihood: 0.55 },
        { itemName: "West Elm mid-century tripod floor lamp (reproduction)", brand: "West Elm", model: "Mid-Century Tripod", likelihood: 0.3 },
        { itemName: "Target Project 62 tripod floor lamp", brand: "Project 62", model: null, likelihood: 0.15 },
      ],
      unknowns: ["Maker (no label found)", "Exact height", "Whether it lights when plugged in", "Wood species (teak vs walnut)"],
      needsMorePhotos: ["underside", "label_closeup", "power_on_screen"],
      searchKeywords: ["mid century teak tripod floor lamp", "MCM tripod lamp", "Danish modern floor lamp", "teak floor lamp drum shade", "vintage tripod lamp"],
      barcodeVisible: null,
      notes: "Check under the base and inside the socket cap for a maker's mark; a brand would change the estimate a lot.",
    },
    comps: [
      { title: "Mid Century Modern Teak Tripod Floor Lamp Danish 1960s Drum Shade", price: $(225), shipping: 0, condition: "Used", conditionGrade: "GOOD", buyingOption: "FIXED_PRICE", daysAgo: 8 },
      { title: "Vintage MCM tripod floor lamp teak wood brass ferrules linen shade", price: $(185), shipping: $(45), condition: "Used", conditionGrade: "GOOD", buyingOption: "BEST_OFFER", daysAgo: 3 },
      { title: "Mid-century teak tripod floor lamp 60s Danish modern - rewired", price: $(295), shipping: 0, condition: "Used", conditionGrade: "VERY_GOOD", buyingOption: "FIXED_PRICE", daysAgo: 15 },
      { title: "Mid Century Tripod Floor Lamp Teak with Drum Shade - West Elm", price: $(129), shipping: $(39), condition: "Used", conditionGrade: "VERY_GOOD", buyingOption: "FIXED_PRICE", daysAgo: 5 },
      { title: "MCM walnut tripod floor lamp 1960s no shade", price: $(140), shipping: $(50), condition: "Used", conditionGrade: "FAIR", buyingOption: "AUCTION", daysAgo: 2 },
      { title: "Danish modern teak tripod floor lamp mid century original shade", price: $(260), shipping: 0, condition: "Used", conditionGrade: "GOOD", buyingOption: "FIXED_PRICE", daysAgo: 24, soldDaysAgo: 6 },
      { title: "Mid century modern tripod floor lamp teak drum shade 58 in", price: $(175), shipping: $(48), condition: "Used", conditionGrade: "GOOD", buyingOption: "FIXED_PRICE", daysAgo: 40 },
      { title: "Vintage brass floor lamp torchiere 1970s", price: $(90), shipping: $(35), condition: "Used", conditionGrade: "GOOD", buyingOption: "FIXED_PRICE", daysAgo: 6 },
      { title: "Teak tripod floor lamp mid century modern style linen shade", price: $(199), shipping: $(40), condition: "Used", conditionGrade: "VERY_GOOD", buyingOption: "BEST_OFFER", daysAgo: 12 },
    ],
    vocabulary: { aspects: ["Style: Mid-Century Modern", "Type: Floor Lamp", "Material: Teak", "Shade Shape: Drum", "Era: 1960s"], categories: ["Lamps"] },
    copy: {
      title: "Mid-Century Modern Teak Tripod Floor Lamp with Linen Drum Shade",
      seoTitle: "Mid Century Modern Teak Tripod Floor Lamp Linen Drum Shade Danish Style Brass Ferrules",
      intro: [
        "A mid-century modern style tripod floor lamp with three turned wooden legs, brass ferrules and an off-white linen drum shade. The wood appears to be teak, though this is not verified.",
        "No maker's mark was found. Height is estimated at around 150 cm. It has an inline cord switch and a standard E26 socket; it has not been tested lit.",
      ],
      persuasiveIntro: "A warm, sculptural tripod lamp in the Danish mid-century manner — the piece that anchors a reading corner without shouting.",
      bullets: ["Tripod floor lamp, mid-century modern style", "Warm brown wood (likely teak) with brass ferrules", "Off-white linen drum shade included", "Inline cord switch, E26 socket", "Untested — maker unknown"],
      keywords: ["mid century lamp", "tripod floor lamp", "teak lamp", "Danish modern", "MCM lighting", "drum shade", "vintage floor lamp", "1960s"],
      specifics: [
        { name: "Type", value: "Floor lamp" },
        { name: "Style", value: "Mid-century modern" },
        { name: "Material", value: "Teak (likely), brass" },
        { name: "Color", value: "Warm brown, off-white shade" },
      ],
      suggestedCategoryPath: ["Home & Garden", "Lamps, Lighting & Ceiling Fans", "Lamps"],
    },
  },

  // ───────────────────────── 9. Power drill ─────────────────────────
  {
    slug: "dewalt-dcd771c2",
    keywords: ["drill", "dewalt", "power tool", "cordless", "driver", "milwaukee", "makita", "ryobi", "tool"],
    profile: {
      itemName: f("DeWalt DCD771C2 20V MAX cordless drill/driver kit", 0.94, 1, "'DCD771' printed on the drill body; two batteries and charger in the bag"),
      brand: f("DeWalt", 0.99, 1, "Yellow and black with the DeWalt logo"),
      model: f("DCD771C2", 0.9, 2, "Model label on the drill; C2 kit denotes two batteries"),
      modelNumber: f("DCD771C2", 0.9, 2),
      categoryPath: ["Home & Garden", "Tools & Workshop Equipment", "Power Tools", "Drills"],
      categoryConfidence: 0.99,
      color: f("Yellow and black", 0.99, 1),
      material: null,
      size: f("1/2-inch chuck", 0.85, 3),
      dimensions: null,
      approximateAge: null,
      attributes: [
        attr("Voltage", "20V MAX", 0.97, 1),
        attr("Batteries", "Two DCB201 1.3 Ah", 0.82, 2, "Battery labels visible"),
        attr("Charger", "DCB112", 0.7, 4, "Charger label partly visible"),
        attr("Speed settings", "2-speed (0–450 / 0–1500 RPM)", 0.8, 3, "Speed selector on top"),
      ],
      accessoriesIncluded: ["Two 20V batteries", "Charger", "Contractor bag", "Belt hook"],
      possiblyMissing: ["Manual not shown", "Drill bits not shown"],
      condition: {
        grade: "GOOD",
        confidence: 0.84,
        tier: "LIKELY",
        summary: "Typical jobsite wear with scuffs on the housing and a worn rubber grip. The chuck closes evenly in the photo; battery health is unknown.",
        defects: [
          { type: "scuff", location: "Housing and battery base", severity: "minor", description: "Multiple scuffs and paint transfer", evidenceImage: 1 },
          { type: "wear", location: "Rubber grip", severity: "minor", description: "Smoothed grip texture", evidenceImage: 3 },
        ],
        functionalStatus: "untested",
      },
      identityConfidence: 0.94,
      identityTier: "CONFIDENT",
      alternativeIdentifications: [],
      unknowns: ["Battery capacity after use", "Whether the clutch settings all work", "Whether the chuck holds bits without slipping"],
      needsMorePhotos: ["power_on_screen", "accessories"],
      searchKeywords: ["DeWalt DCD771C2", "DCD771", "DeWalt 20V MAX drill driver kit", "DeWalt cordless drill 2 batteries", "20V drill kit"],
      barcodeVisible: null,
      notes: null,
    },
    comps: [
      { title: "DEWALT DCD771C2 20V MAX Cordless Drill/Driver Kit 2 Batteries Charger Bag", price: $(79), shipping: 0, condition: "Used", conditionGrade: "VERY_GOOD", buyingOption: "FIXED_PRICE", daysAgo: 3 },
      { title: "DeWalt DCD771 20V drill driver with 2 batteries and charger - works great", price: $(68), shipping: $(12), condition: "Used", conditionGrade: "GOOD", buyingOption: "BEST_OFFER", daysAgo: 8 },
      { title: "DeWalt DCD771C2 20V MAX 1/2 in Compact Drill Driver Kit NEW", price: $(119), shipping: 0, condition: "New", conditionGrade: "NEW_SEALED", buyingOption: "FIXED_PRICE", daysAgo: 12 },
      { title: "DeWalt DCD771 20V Max cordless drill TOOL ONLY", price: $(38), shipping: $(9.5), condition: "Used", conditionGrade: "GOOD", buyingOption: "FIXED_PRICE", daysAgo: 2 },
      { title: "DEWALT 20V MAX DCD771C2 Drill Driver Kit w/ 2 batteries, charger, bag - tested", price: $(72), shipping: $(11), condition: "Used", conditionGrade: "GOOD", buyingOption: "FIXED_PRICE", daysAgo: 19, soldDaysAgo: 3 },
      { title: "DeWalt DCD771C2 20V Compact Drill Driver kit 2 Ah batteries", price: $(89), shipping: $(10), condition: "Used", conditionGrade: "VERY_GOOD", buyingOption: "AUCTION", daysAgo: 1 },
      { title: "Milwaukee M18 2606-22CT drill driver kit 2 batteries", price: $(95), shipping: $(12), condition: "Used", conditionGrade: "VERY_GOOD", buyingOption: "FIXED_PRICE", daysAgo: 6 },
      { title: "DeWalt DCD771C2 20V MAX cordless drill kit - one battery dead", price: $(52), shipping: $(12), condition: "Used", conditionGrade: "FAIR", buyingOption: "FIXED_PRICE", daysAgo: 29 },
      { title: "DeWalt DCD771C2 20V drill/driver kit, two batteries, charger, bag", price: $(75), shipping: $(9.99), condition: "Used", conditionGrade: "GOOD", buyingOption: "FIXED_PRICE", daysAgo: 45, soldDaysAgo: 15 },
      { title: "DEWALT DCD771C2 20-Volt MAX Cordless 1/2 in. Drill/Driver Kit open box", price: $(99), shipping: 0, condition: "Open box", conditionGrade: "NEW_OPEN_BOX", buyingOption: "FIXED_PRICE", daysAgo: 10 },
      { title: "DeWalt 20V drill DCD771 kit 2 batteries charger", price: $(64), shipping: $(13), condition: "Used", conditionGrade: "GOOD", buyingOption: "BEST_OFFER", daysAgo: 58 },
    ],
    vocabulary: { aspects: ["Brand: DEWALT", "Model: DCD771C2", "Voltage: 20 V", "Chuck Size: 1/2 in", "Battery Included: Yes", "Type: Drill/Driver"], categories: ["Drills", "Cordless Drills"] },
    copy: {
      title: "DeWalt DCD771C2 20V MAX Cordless Drill/Driver Kit, 2 Batteries, Charger, Bag",
      seoTitle: "DeWalt DCD771C2 20V MAX 1/2 in Cordless Drill Driver Kit 2 Batteries Charger Contractor Bag",
      intro: [
        "A DeWalt DCD771C2 20V MAX cordless drill/driver kit with two 20V batteries (DCB201 1.3 Ah), the DCB112 charger, belt hook and contractor bag.",
        "Half-inch chuck and a 2-speed gearbox. It has had real use — the housing is scuffed and the grip is worn — and has not been load-tested for this listing.",
      ],
      persuasiveIntro: "DeWalt's most popular compact drill kit, complete with two batteries and the charger — everything needed to get through a weekend of projects, priced well below new.",
      bullets: ["DeWalt DCD771C2, 20V MAX", "1/2-inch chuck, 2-speed gearbox", "Two DCB201 batteries and DCB112 charger", "Contractor bag and belt hook", "Jobsite wear disclosed below"],
      keywords: ["DeWalt drill", "DCD771C2", "20V MAX", "cordless drill kit", "drill driver", "DeWalt 20V batteries", "power tools", "DCD771"],
      specifics: [
        { name: "Brand", value: "DeWalt" },
        { name: "Model", value: "DCD771C2" },
        { name: "Voltage", value: "20V MAX" },
        { name: "Chuck Size", value: "1/2 inch" },
        { name: "Color", value: "Yellow and black" },
      ],
      suggestedCategoryPath: ["Home & Garden", "Tools & Workshop Equipment", "Power Tools", "Drills"],
    },
  },

  // ───────────────────────── 10. Running shoes ─────────────────────────
  {
    slug: "nike-pegasus-40",
    keywords: ["shoes", "sneakers", "running", "nike", "pegasus", "adidas", "brooks", "asics", "hoka", "trainers"],
    profile: {
      itemName: f("Nike Air Zoom Pegasus 40 men's running shoes, black/white, US 10.5", 0.91, 1, "Pegasus 40 upper and swoosh; size from the tongue label"),
      brand: f("Nike", 0.99, 1),
      model: f("Air Zoom Pegasus 40", 0.9, 2, "'Pegasus 40' printed on the heel"),
      modelNumber: f("DV3853-001", 0.86, 3, "Tongue label style code"),
      categoryPath: ["Clothing, Shoes & Accessories", "Men", "Men's Shoes", "Athletic Shoes"],
      categoryConfidence: 0.99,
      color: f("Black/White", 0.98, 1),
      material: f("Mesh upper, rubber outsole", 0.9, 1),
      size: f("US 10.5 (men's)", 0.93, 3, "Tongue label"),
      dimensions: null,
      approximateAge: f("2023", 0.7, 3, "Pegasus 40 release year"),
      attributes: [
        attr("Style code", "DV3853-001", 0.86, 3),
        attr("Width", "Regular (D)", 0.75, 3),
        attr("Closure", "Lace-up", 0.99, 1),
      ],
      accessoriesIncluded: [],
      possiblyMissing: ["Retail box not shown", "Spare laces not shown"],
      condition: {
        grade: "GOOD",
        confidence: 0.83,
        tier: "LIKELY",
        summary: "Outsole shows moderate tread wear at the heel and the insoles have some imprinting. The uppers are clean with no tears; midsole creasing is visible.",
        defects: [
          { type: "wear", location: "Outsole heel", severity: "moderate", description: "Tread worn at the outer heel on both shoes", evidenceImage: 4 },
          { type: "wear", location: "Midsole", severity: "minor", description: "Creasing across the forefoot", evidenceImage: 2 },
        ],
        functionalStatus: "not_applicable",
      },
      identityConfidence: 0.91,
      identityTier: "CONFIDENT",
      alternativeIdentifications: [],
      unknowns: ["Approximate miles run", "Whether the insoles are original"],
      needsMorePhotos: ["inside", "underside"],
      searchKeywords: ["Nike Pegasus 40", "Air Zoom Pegasus 40 men's 10.5", "DV3853-001", "Nike running shoes 10.5 black", "Pegasus 40 black white"],
      barcodeVisible: null,
      notes: null,
    },
    comps: [
      { title: "Nike Air Zoom Pegasus 40 Men's Size 10.5 Black White DV3853-001 Running Shoes", price: $(62), shipping: 0, condition: "Pre-owned", conditionGrade: "GOOD", buyingOption: "FIXED_PRICE", daysAgo: 4 },
      { title: "Nike Pegasus 40 men's 10.5 black/white running - light use", price: $(74), shipping: $(9.99), condition: "Pre-owned", conditionGrade: "VERY_GOOD", buyingOption: "BEST_OFFER", daysAgo: 10 },
      { title: "Nike Air Zoom Pegasus 40 DV3853-001 Black White Men's 10.5 NEW", price: $(95), shipping: 0, condition: "New with box", conditionGrade: "NEW_SEALED", buyingOption: "FIXED_PRICE", daysAgo: 6 },
      { title: "Nike Air Zoom Pegasus 40 Men's Sz 11 Black White DV3853-001", price: $(58), shipping: $(10), condition: "Pre-owned", conditionGrade: "GOOD", buyingOption: "FIXED_PRICE", daysAgo: 2 },
      { title: "Nike Pegasus 40 mens 10.5 black running shoes worn", price: $(45), shipping: $(12), condition: "Pre-owned", conditionGrade: "FAIR", buyingOption: "AUCTION", daysAgo: 1 },
      { title: "Nike Air Zoom Pegasus 40 Black/White men's 10.5 - excellent", price: $(69), shipping: $(8), condition: "Pre-owned", conditionGrade: "VERY_GOOD", buyingOption: "FIXED_PRICE", daysAgo: 18, soldDaysAgo: 4 },
      { title: "Nike Air Zoom Pegasus 39 men's 10.5 black white", price: $(52), shipping: $(9), condition: "Pre-owned", conditionGrade: "GOOD", buyingOption: "FIXED_PRICE", daysAgo: 7 },
      { title: "Brooks Ghost 15 men's 10.5 black running shoes", price: $(55), shipping: $(10), condition: "Pre-owned", conditionGrade: "GOOD", buyingOption: "FIXED_PRICE", daysAgo: 5 },
      { title: "Nike Air Zoom Pegasus 40 Men's 10.5 Black White DV3853-001 - great tread", price: $(66), shipping: $(9.5), condition: "Pre-owned", conditionGrade: "VERY_GOOD", buyingOption: "BEST_OFFER", daysAgo: 30, soldDaysAgo: 9 },
      { title: "Nike Pegasus 40 Black White Men's 10.5 Running Shoes DV3853-001", price: $(60), shipping: $(11), condition: "Pre-owned", conditionGrade: "GOOD", buyingOption: "FIXED_PRICE", daysAgo: 47 },
      { title: "Nike Air Zoom Pegasus 40 mens 10.5 black - open box, tried on", price: $(85), shipping: 0, condition: "New without box", conditionGrade: "NEW_OPEN_BOX", buyingOption: "FIXED_PRICE", daysAgo: 14 },
    ],
    vocabulary: { aspects: ["Brand: Nike", "Model: Nike Air Zoom Pegasus 40", "US Shoe Size: 10.5", "Color: Black", "Type: Athletic", "Style Code: DV3853-001"], categories: ["Athletic Shoes"] },
    copy: {
      title: "Nike Air Zoom Pegasus 40 Men's Running Shoes, Black/White, US 10.5, DV3853-001",
      seoTitle: "Nike Air Zoom Pegasus 40 Men's 10.5 Black White DV3853-001 Running Shoes Mesh",
      intro: [
        "Nike Air Zoom Pegasus 40 men's running shoes in Black/White, US size 10.5, style code DV3853-001. Mesh upper with a rubber outsole and lace-up closure.",
        "These have been run in: the outsole heel is worn and the midsole is creased. Uppers are clean with no tears.",
      ],
      persuasiveIntro: "Nike's do-everything daily trainer, the Pegasus 40, in the classic black/white — plenty of miles left at a fraction of retail.",
      bullets: ["Nike Air Zoom Pegasus 40, men's US 10.5", "Black/White colourway, style DV3853-001", "Mesh upper, rubber outsole", "Lace-up closure", "Moderate heel wear disclosed below"],
      keywords: ["Nike Pegasus 40", "running shoes", "Nike men's 10.5", "DV3853-001", "Air Zoom Pegasus", "black white sneakers", "Nike running", "daily trainer"],
      specifics: [
        { name: "Brand", value: "Nike" },
        { name: "Model", value: "Air Zoom Pegasus 40" },
        { name: "Size", value: "US 10.5 (men's)" },
        { name: "Color", value: "Black/White" },
        { name: "Style Code", value: "DV3853-001" },
        { name: "Material", value: "Mesh upper, rubber outsole" },
      ],
      suggestedCategoryPath: ["Clothing, Shoes & Accessories", "Men", "Men's Shoes", "Athletic Shoes"],
    },
  },

  // ───────────────────────── 11. Lego set ─────────────────────────
  {
    slug: "lego-10264-corner-garage",
    keywords: ["lego", "brick", "set", "modular", "10264", "creator", "toy", "playmobil"],
    profile: {
      itemName: f("LEGO Creator Expert 10264 Corner Garage, built", 0.9, 1, "Modular corner garage with the 10264 tow truck and gas pump visible"),
      brand: f("LEGO", 0.99, 1),
      model: f("10264 Corner Garage", 0.9, 1, "Set recognised from the distinctive corner garage build"),
      modelNumber: f("10264", 0.9, 4, "Instruction booklet cover shows 10264"),
      categoryPath: ["Toys & Hobbies", "Building Toys", "LEGO Complete Sets & Packs"],
      categoryConfidence: 0.99,
      color: f("Multi-colour", 0.99, 1),
      material: f("ABS plastic", 0.95, 1),
      size: f("2,569 pieces (as designed)", 0.85, null, "Official piece count; completeness not verified"),
      dimensions: null,
      approximateAge: f("Released 2019", 0.9, null),
      attributes: [
        attr("Theme", "Creator Expert (Modular Buildings)", 0.95, 1),
        attr("Minifigures", "6 visible", 0.8, 2, "Six minifigures in photo 2; set includes six"),
        attr("Instructions", "Included (booklet visible)", 0.85, 4),
        attr("Box", "Not shown", 0.3, null),
      ],
      accessoriesIncluded: ["Instruction booklet", "Six minifigures", "Tow truck build"],
      possiblyMissing: ["Original box not shown", "Sticker sheet leftovers not shown"],
      condition: {
        grade: "VERY_GOOD",
        confidence: 0.8,
        tier: "LIKELY",
        summary: "Built and displayed; bricks look clean with minimal dust in the photos. Completeness against the 2,569-piece inventory has not been verified.",
        defects: [{ type: "other", location: "Overall", severity: "minor", description: "Displayed build; light dust on the roof pieces", evidenceImage: 1 }],
        functionalStatus: "not_applicable",
      },
      identityConfidence: 0.9,
      identityTier: "CONFIDENT",
      alternativeIdentifications: [],
      unknowns: ["Whether the set is 100% complete", "Whether the original box is included", "Whether any parts are yellowed"],
      needsMorePhotos: ["accessories", "back"],
      searchKeywords: ["LEGO 10264", "LEGO Corner Garage", "Creator Expert modular 10264", "LEGO modular building complete", "LEGO Corner Garage minifigures"],
      barcodeVisible: null,
      notes: null,
    },
    comps: [
      { title: "LEGO Creator Expert 10264 Corner Garage 100% Complete with Instructions & Minifigures", price: $(279), shipping: $(18), condition: "Used", conditionGrade: "VERY_GOOD", buyingOption: "FIXED_PRICE", daysAgo: 5 },
      { title: "LEGO 10264 Corner Garage Modular Building - complete, box, instructions", price: $(310), shipping: 0, condition: "Used", conditionGrade: "LIKE_NEW", buyingOption: "BEST_OFFER", daysAgo: 12 },
      { title: "LEGO Creator Expert Corner Garage (10264) NEW SEALED retired", price: $(389), shipping: 0, condition: "New", conditionGrade: "NEW_SEALED", buyingOption: "FIXED_PRICE", daysAgo: 3 },
      { title: "LEGO 10264 Corner Garage built once, complete w/ minifigs no box", price: $(245), shipping: $(20), condition: "Used", conditionGrade: "VERY_GOOD", buyingOption: "FIXED_PRICE", daysAgo: 2 },
      { title: "Lego Creator 10264 Corner Garage modular - 100% complete - displayed", price: $(259), shipping: $(15), condition: "Used", conditionGrade: "VERY_GOOD", buyingOption: "AUCTION", daysAgo: 1 },
      { title: "LEGO Corner Garage 10264 complete set with instructions and minifigures", price: $(265), shipping: $(19.99), condition: "Used", conditionGrade: "VERY_GOOD", buyingOption: "FIXED_PRICE", daysAgo: 25, soldDaysAgo: 5 },
      { title: "LEGO 10264 Corner Garage - missing 12 pieces, no minifigs", price: $(170), shipping: $(18), condition: "Used", conditionGrade: "FAIR", buyingOption: "FIXED_PRICE", daysAgo: 8 },
      { title: "LEGO Creator Expert 10260 Downtown Diner complete", price: $(215), shipping: $(18), condition: "Used", conditionGrade: "VERY_GOOD", buyingOption: "FIXED_PRICE", daysAgo: 6 },
      { title: "LEGO Creator Expert Corner Garage 10264 complete instructions box", price: $(295), shipping: $(16), condition: "Used", conditionGrade: "VERY_GOOD", buyingOption: "BEST_OFFER", daysAgo: 38 },
      { title: "LEGO 10264 Corner Garage modular building complete adult owned", price: $(250), shipping: $(22), condition: "Used", conditionGrade: "GOOD", buyingOption: "FIXED_PRICE", daysAgo: 50, soldDaysAgo: 21 },
      { title: "Lot of 3 LEGO modular buildings 10264 10260 10255 bundle", price: $(700), shipping: $(45), condition: "Used", conditionGrade: null, buyingOption: "FIXED_PRICE", daysAgo: 9 },
    ],
    vocabulary: { aspects: ["Brand: LEGO", "LEGO Set Number: 10264", "LEGO Theme: Creator Expert", "Piece Count: 2569", "Features: Minifigures Included"], categories: ["LEGO Complete Sets & Packs"] },
    copy: {
      title: "LEGO Creator Expert 10264 Corner Garage, Built, with Instructions and 6 Minifigures",
      seoTitle: "LEGO 10264 Corner Garage Creator Expert Modular Building Instructions 6 Minifigures Tow Truck Retired",
      intro: [
        "LEGO Creator Expert 10264 Corner Garage from the modular buildings line, built and displayed. Includes the instruction booklet, the tow truck build and six minifigures.",
        "The set is designed with 2,569 pieces; I have not counted it against the inventory, so completeness is not guaranteed. The original box is not included.",
      ],
      persuasiveIntro: "The retired 10264 Corner Garage — three modular floors, the tow truck and all six minifigures — ready to slot into your city street.",
      bullets: ["LEGO Creator Expert 10264 Corner Garage", "Built and displayed; six minifigures", "Instruction booklet included", "Tow truck and gas pump builds", "Completeness not verified — see unknowns"],
      keywords: ["LEGO 10264", "Corner Garage", "LEGO modular", "Creator Expert", "LEGO minifigures", "retired LEGO set", "modular building", "LEGO garage"],
      specifics: [
        { name: "Brand", value: "LEGO" },
        { name: "Set Number", value: "10264" },
        { name: "Theme", value: "Creator Expert" },
        { name: "Piece Count", value: "2,569 (as designed)" },
        { name: "Material", value: "ABS plastic" },
      ],
      suggestedCategoryPath: ["Toys & Hobbies", "Building Toys", "LEGO Complete Sets & Packs"],
    },
  },

  // ───────────────────────── 12. Cast-iron skillet ─────────────────────────
  {
    slug: "lodge-l10sk3",
    keywords: ["skillet", "cast iron", "cast-iron", "lodge", "pan", "cookware", "griswold", "wagner", "le creuset", "staub"],
    profile: {
      itemName: f("Lodge 12-inch cast iron skillet L10SK3", 0.95, 4, "Underside reads 'LODGE 12 INCH SKILLET MADE IN USA L10SK3'"),
      brand: f("Lodge", 0.99, 4, "Cast into the underside"),
      model: f("L10SK3", 0.96, 4, "Model number cast into the underside"),
      modelNumber: f("L10SK3", 0.96, 4),
      categoryPath: ["Home & Garden", "Kitchen, Dining & Bar", "Cookware", "Skillets"],
      categoryConfidence: 0.99,
      color: f("Black (seasoned)", 0.98, 1),
      material: f("Cast iron", 0.99, 1),
      size: f("12 inch", 0.97, 4),
      dimensions: null,
      approximateAge: null,
      attributes: [
        attr("Made in", "USA", 0.97, 4),
        attr("Handle", "Assist handle plus long handle", 0.98, 1),
        attr("Pour spouts", "Two", 0.95, 1),
      ],
      accessoriesIncluded: [],
      possiblyMissing: ["Lid not shown (sold separately by Lodge)"],
      condition: {
        grade: "GOOD",
        confidence: 0.86,
        tier: "CONFIDENT",
        summary: "Well-seasoned cooking surface with some uneven seasoning near the rim. A small spot of surface rust on the underside near the handle; no cracks or warping visible.",
        defects: [
          { type: "discoloration", location: "Underside near handle", severity: "minor", description: "Small patch of surface rust, easily removed", evidenceImage: 4 },
          { type: "wear", location: "Interior rim", severity: "minor", description: "Uneven seasoning", evidenceImage: 2 },
        ],
        functionalStatus: "not_applicable",
      },
      identityConfidence: 0.95,
      identityTier: "CONFIDENT",
      alternativeIdentifications: [],
      unknowns: ["Whether the pan sits flat (warping) — photographed on a towel"],
      needsMorePhotos: ["underside"],
      searchKeywords: ["Lodge 12 inch cast iron skillet", "Lodge L10SK3", "cast iron skillet 12", "Lodge skillet USA", "seasoned cast iron pan"],
      barcodeVisible: null,
      notes: null,
    },
    comps: [
      { title: "Lodge L10SK3 12 Inch Cast Iron Skillet Pre-Seasoned Made in USA", price: $(29), shipping: $(11.5), condition: "Used", conditionGrade: "GOOD", buyingOption: "FIXED_PRICE", daysAgo: 3 },
      { title: "Lodge 12 inch cast iron skillet L10SK3 - great seasoning", price: $(34), shipping: $(12), condition: "Used", conditionGrade: "VERY_GOOD", buyingOption: "FIXED_PRICE", daysAgo: 9 },
      { title: "Lodge 12\" Cast Iron Skillet L10SK3 NEW", price: $(39.9), shipping: 0, condition: "New", conditionGrade: "NEW_SEALED", buyingOption: "FIXED_PRICE", daysAgo: 6 },
      { title: "Lodge L10SK3 12 in cast iron skillet USA assist handle", price: $(25), shipping: $(13), condition: "Used", conditionGrade: "GOOD", buyingOption: "AUCTION", daysAgo: 1 },
      { title: "Lodge 12 inch cast iron skillet - some rust, needs re-seasoning", price: $(18), shipping: $(12), condition: "Used", conditionGrade: "FAIR", buyingOption: "FIXED_PRICE", daysAgo: 5 },
      { title: "Lodge Cast Iron Skillet 12 Inch L10SK3 Made in USA seasoned", price: $(31), shipping: $(10.5), condition: "Used", conditionGrade: "GOOD", buyingOption: "BEST_OFFER", daysAgo: 22, soldDaysAgo: 4 },
      { title: "Griswold No. 10 cast iron skillet large block logo", price: $(145), shipping: $(18), condition: "Used", conditionGrade: "GOOD", buyingOption: "FIXED_PRICE", daysAgo: 4 },
      { title: "Lodge L10SK3 12-inch cast iron skillet with lid", price: $(45), shipping: $(14), condition: "Used", conditionGrade: "VERY_GOOD", buyingOption: "FIXED_PRICE", daysAgo: 15 },
      { title: "Lodge 12 inch cast iron skillet L10SK3 USA - clean", price: $(27), shipping: $(12.5), condition: "Used", conditionGrade: "GOOD", buyingOption: "FIXED_PRICE", daysAgo: 41, soldDaysAgo: 18 },
      { title: "Lodge 10.25 inch cast iron skillet L8SK3", price: $(19), shipping: $(10), condition: "Used", conditionGrade: "GOOD", buyingOption: "FIXED_PRICE", daysAgo: 2 },
    ],
    vocabulary: { aspects: ["Brand: Lodge", "Model: L10SK3", "Material: Cast Iron", "Diameter: 12 in", "Country of Manufacture: United States", "Type: Skillet"], categories: ["Skillets"] },
    copy: {
      title: "Lodge 12-Inch Cast Iron Skillet L10SK3, Made in USA, Seasoned",
      seoTitle: "Lodge L10SK3 12 Inch Cast Iron Skillet Made in USA Pre-Seasoned Assist Handle Pour Spouts",
      intro: [
        "A Lodge 12-inch cast iron skillet, model L10SK3, made in the USA. Long handle with an assist handle and two pour spouts.",
        "The cooking surface is well seasoned with some unevenness near the rim, and there is a small patch of surface rust on the underside near the handle.",
      ],
      persuasiveIntro: "The workhorse Lodge 12-inch skillet, already seasoned and broken in — cast iron only gets better with use, and this one has a head start.",
      bullets: ["Lodge L10SK3, 12-inch cast iron skillet", "Made in USA", "Assist handle and two pour spouts", "Seasoned cooking surface", "Small underside rust spot disclosed below"],
      keywords: ["Lodge skillet", "cast iron skillet", "12 inch skillet", "L10SK3", "Lodge cast iron", "made in USA cookware", "seasoned cast iron", "frying pan"],
      specifics: [
        { name: "Brand", value: "Lodge" },
        { name: "Model", value: "L10SK3" },
        { name: "Material", value: "Cast iron" },
        { name: "Size", value: "12 inch" },
        { name: "Made in", value: "USA" },
      ],
      suggestedCategoryPath: ["Home & Garden", "Kitchen, Dining & Bar", "Cookware", "Skillets"],
    },
  },
];

/** Case-insensitive keyword match against seller hints; returns the entry with the most hits or null. */
export function matchCatalogByHints(hints: Array<string | null | undefined>): DemoCatalogEntry | null {
  const text = hints
    .filter((h): h is string => !!h && h.trim().length > 0)
    .join(" ")
    .toLowerCase();
  if (!text) return null;
  let best: { entry: DemoCatalogEntry; score: number } | null = null;
  for (const entry of DEMO_CATALOG) {
    let score = 0;
    for (const k of entry.keywords) if (text.includes(k)) score += k.length > 4 ? 2 : 1;
    const brand = entry.profile.brand?.value.toLowerCase();
    if (brand && text.includes(brand)) score += 3;
    const model = entry.profile.model?.value.toLowerCase();
    if (model && text.includes(model)) score += 4;
    if (score > 0 && (!best || score > best.score)) best = { entry, score };
  }
  return best?.entry ?? null;
}

/** Finds the catalogue entry an identified profile came from (by name/brand/model), or the closest by category. */
export function matchCatalogByProfile(profile: Pick<ItemProfile, "itemName" | "brand" | "model" | "categoryPath">): DemoCatalogEntry | null {
  const name = profile.itemName.value.toLowerCase();
  for (const entry of DEMO_CATALOG) {
    if (entry.profile.itemName.value.toLowerCase() === name) return entry;
    if (entry.escalated?.itemName && entry.escalated.itemName.value.toLowerCase() === name) return entry;
  }
  const byHint = matchCatalogByHints([profile.itemName.value, profile.brand?.value, profile.model?.value]);
  if (byHint) return byHint;
  const top = profile.categoryPath[0]?.toLowerCase();
  if (top) {
    const cat = DEMO_CATALOG.find((e) => e.profile.categoryPath[0]?.toLowerCase() === top);
    if (cat) return cat;
  }
  return null;
}

export function catalogBySlug(slug: string): DemoCatalogEntry | null {
  return DEMO_CATALOG.find((e) => e.slug === slug) ?? null;
}

/** Deterministic pick from a hash string (used when no hints match). */
export function catalogByHash(hash: string): DemoCatalogEntry {
  const n = parseInt(hash.slice(0, 8), 16);
  const idx = (Number.isFinite(n) ? n : 0) % DEMO_CATALOG.length;
  return DEMO_CATALOG[idx]!;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
}

/** Median landed price of a catalogue entry's single-item comps, in cents. */
export function catalogEntryMedianCents(entry: DemoCatalogEntry): number {
  return median(entry.comps.filter((c) => c.conditionGrade !== "FOR_PARTS" && c.conditionGrade !== null).map((c) => c.price + c.shipping));
}

/** A conservative category prior from the catalogue: median of the entries sharing the top-level category. */
export function catalogFallbackForCategory(categoryPath: string[]): { medianCents: number; source: string } | null {
  const top = categoryPath[0]?.toLowerCase();
  if (!top) return null;
  const entries = DEMO_CATALOG.filter((e) => e.profile.categoryPath[0]?.toLowerCase() === top);
  if (entries.length === 0) return null;
  return { medianCents: median(entries.map(catalogEntryMedianCents)), source: `demo catalogue: ${categoryPath[0]}` };
}
