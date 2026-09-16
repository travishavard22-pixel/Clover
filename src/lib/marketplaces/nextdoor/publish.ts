import type { MarketplaceConnection } from "../../db";
import { nextdoorFetch } from "./client";
import type { NextdoorCategoryId } from "./categories";

export type NextdoorFsfInput = {
  title: string;
  description: string;
  /** Whole dollars as a string, USD only (per the FSF reference). */
  price: string;
  category: NextdoorCategoryId;
  /** ≤ 10 public HTTPS image URLs. */
  imageUrls: string[];
  bodyText: string;
  hashtag?: string;
};

export type NextdoorFsfResult = { shareLink: string; postId: string | null };

/** POST /post/fsf/ — creates a For Sale & Free listing under the seller's own Nextdoor account. */
export async function createFsfPost(c: MarketplaceConnection, input: NextdoorFsfInput): Promise<NextdoorFsfResult> {
  const data = await nextdoorFetch<{ result?: string; share_link?: string; id?: string | number; classified_id?: string | number }>(c, {
    method: "POST",
    path: "/post/fsf/",
    body: {
      fsf: { title: input.title.slice(0, 80), description: input.description, price: input.price, category: input.category, image_attachments: input.imageUrls.slice(0, 10) },
      body_text: input.bodyText.slice(0, 8192),
      ...(input.hashtag ? { hashtag: input.hashtag } : {}),
    },
  });
  const shareLink = data.share_link ?? "";
  const fromBody = data.classified_id ?? data.id;
  const fromLink = shareLink.match(/\/p\/([A-Za-z0-9_-]+)/)?.[1] ?? null;
  return { shareLink, postId: fromBody !== undefined ? String(fromBody) : fromLink };
}

/** PUT /post/fsf/ { classified_id, sold: true } — marks the listing sold. */
export async function markFsfSold(c: MarketplaceConnection, classifiedId: string): Promise<void> {
  await nextdoorFetch(c, { method: "PUT", path: "/post/fsf/", body: { classified_id: classifiedId, sold: true } });
}

/** Whole-dollar price string Nextdoor expects (it does not accept cents). */
export function nextdoorPrice(priceCents: number): string {
  return String(Math.max(0, Math.round(priceCents / 100)));
}
