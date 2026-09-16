/** Nextdoor For Sale & Free categories (developer.nextdoor.com → create-fsf-post). */
export const NEXTDOOR_CATEGORIES = [
  { id: "APPLIANCES", label: "Appliances" },
  { id: "AUTOMOTIVE", label: "Automotive" },
  { id: "BABY_AND_KIDS", label: "Baby & kids" },
  { id: "BICYCLES", label: "Bicycles" },
  { id: "CLOTHING", label: "Clothing & accessories" },
  { id: "ELECTRONICS", label: "Electronics" },
  { id: "FURNITURE", label: "Furniture" },
  { id: "GARAGE_SALES", label: "Garage sales" },
  { id: "GARDEN", label: "Garden" },
  { id: "HOME_DECOR", label: "Home decor" },
  { id: "HOME_SALES", label: "Home sales" },
  { id: "IN_SEARCH_OF", label: "In search of" },
  { id: "MUSICAL_INSTRUMENTS", label: "Musical instruments" },
  { id: "NEIGHBOR_MADE", label: "Neighbor made" },
  { id: "NEIGHBOR_SERVICES", label: "Neighbor services" },
  { id: "OTHER", label: "Other" },
  { id: "PET_SUPPLIES", label: "Pet supplies" },
  { id: "PROPERTY_RENTALS", label: "Property rentals" },
  { id: "SPORTS_AND_OUTDOORS", label: "Sports & outdoors" },
  { id: "TOYS_AND_GAMES", label: "Toys & games" },
  { id: "TOOLS", label: "Tools" },
] as const;

export type NextdoorCategoryId = (typeof NEXTDOOR_CATEGORIES)[number]["id"];

const KEYWORDS: Array<{ id: NextdoorCategoryId; words: RegExp }> = [
  { id: "BICYCLES", words: /\b(bike|bicycle|cycling|e-?bike)\b/i },
  { id: "AUTOMOTIVE", words: /\b(car|auto|automotive|tire|wheel|motorcycle|vehicle|truck)\b/i },
  { id: "BABY_AND_KIDS", words: /\b(baby|kids?|toddler|stroller|crib|infant|nursery)\b/i },
  { id: "TOYS_AND_GAMES", words: /\b(toy|toys|game|games|lego|puzzle|board game|video game|console)\b/i },
  { id: "CLOTHING", words: /\b(clothing|clothes|apparel|shoes|sneakers|jacket|dress|jeans|handbag|bag|watch|jewelry|accessor)/i },
  { id: "APPLIANCES", words: /\b(appliance|refrigerator|fridge|washer|dryer|dishwasher|microwave|oven|vacuum|blender|espresso|coffee maker)\b/i },
  { id: "ELECTRONICS", words: /\b(electronic|camera|phone|laptop|computer|tablet|tv|television|audio|speaker|headphone|monitor|gaming|lens|photo)\b/i },
  { id: "FURNITURE", words: /\b(furniture|sofa|couch|chair|table|desk|bed|dresser|shelf|shelving|cabinet)\b/i },
  { id: "GARDEN", words: /\b(garden|plant|lawn|mower|patio|outdoor furniture|planter)\b/i },
  { id: "HOME_DECOR", words: /\b(decor|lamp|rug|art|mirror|vase|frame|kitchen|home)\b/i },
  { id: "MUSICAL_INSTRUMENTS", words: /\b(guitar|piano|keyboard|drum|violin|amp|amplifier|instrument|music)\b/i },
  { id: "PET_SUPPLIES", words: /\b(pet|dog|cat|aquarium|leash|crate)\b/i },
  { id: "SPORTS_AND_OUTDOORS", words: /\b(sport|golf|ski|snowboard|tent|camping|fitness|gym|outdoor|fishing|kayak|skate)\b/i },
  { id: "TOOLS", words: /\b(tool|drill|saw|hardware|wrench|ladder)\b/i },
];

/** Map our free-form category path (broad → specific) to Nextdoor's enum. Returns null when nothing matches confidently. */
export function nextdoorCategoryFor(categoryPath: string[]): { id: NextdoorCategoryId; label: string } | null {
  const text = categoryPath.join(" ");
  if (!text.trim()) return null;
  // Most specific segment first, then the whole path.
  for (const segment of [...categoryPath].reverse()) {
    for (const k of KEYWORDS) if (k.words.test(segment)) return lookup(k.id);
  }
  for (const k of KEYWORDS) if (k.words.test(text)) return lookup(k.id);
  return lookup("OTHER");
}

function lookup(id: NextdoorCategoryId) {
  const c = NEXTDOOR_CATEGORIES.find((c) => c.id === id)!;
  return { id: c.id, label: c.label };
}
