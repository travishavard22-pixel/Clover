import type { WriteListingInput } from "../ai/provider";
import { buildWriteInput, type ListingContext } from "./generate";
import type { Facts } from "./self-check";

/**
 * The closed world of facts a listing may claim, built the same way for generation, tools and the
 * seller's own edits so the self-check badge means the same thing everywhere.
 */
export function factsFromInput(input: WriteListingInput): Facts {
  return {
    itemName: input.profile.itemName.value,
    verifiedAttributes: input.verifiedAttributes,
    condition: input.profile.condition,
    accessoriesIncluded: input.profile.accessoriesIncluded,
    possiblyMissing: input.profile.possiblyMissing,
    unknowns: input.unknowns,
    shipping: input.shipping,
    priceCents: input.priceCents ?? null,
  };
}

export function factsFromContext(ctx: ListingContext): Facts {
  return factsFromInput(buildWriteInput(ctx, "generic"));
}
