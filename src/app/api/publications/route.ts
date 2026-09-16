import { json, withUser } from "@/lib/api";
import { listPublications, parseListingFilters } from "@/lib/marketplaces/listings";

/**
 * GET /api/publications?marketplace=ebay&status=live|published|…&q=text → { listings: ListingDTO[] }
 * Every publication across the seller's items with the item's cover, for the Listings board.
 */
export const GET = withUser(async (req, { user }) => {
  const filters = parseListingFilters(new URL(req.url).searchParams);
  const listings = await listPublications(user.id, filters);
  return json({ listings, filters });
});
