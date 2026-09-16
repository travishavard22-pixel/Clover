import { z } from "zod";
import { json, parseBody, withUser } from "@/lib/api";
import { audit, requestMeta } from "@/lib/audit";
import { getOwnedItem } from "@/lib/items/access";
import { generateListingDrafts } from "@/lib/listings/generate";
import { listDrafts, toDraftDTO } from "@/lib/listings/store";
import { ALL_MARKETPLACES } from "@/lib/marketplaces/registry";

const Schema = z
  .object({
    marketplaces: z.array(z.enum(ALL_MARKETPLACES as [string, ...string[]])).max(ALL_MARKETPLACES.length).optional(),
    tone: z.enum(["neutral", "persuasive", "casual", "professional", "seo", "condition_focus"]).optional(),
  })
  .default({});

/**
 * POST /api/items/[id]/drafts/regenerate { marketplaces?, tone? } → { drafts: ListingDraftDTO[], selfCheck, generatedBy }
 * Rewrites the master draft from the current verified attributes and re-derives the marketplace
 * drafts. Previous copy stays in version history.
 */
export const POST = withUser<{ id: string }>(
  async (req, { user, params }) => {
    const body = req.headers.get("content-length") === "0" || !req.headers.get("content-type")?.includes("json") ? Schema.parse(undefined) : await parseBody(req, Schema);
    const item = await getOwnedItem(user.id, params.id);
    const existing = await listDrafts(item.id);
    const marketplaces = (body.marketplaces as typeof ALL_MARKETPLACES | undefined) ?? (existing.length ? existing.map((d) => d.marketplace).filter((m): m is (typeof ALL_MARKETPLACES)[number] => m !== null) : undefined);
    const out = await generateListingDrafts(item.id, { marketplaces, reason: "regenerated", tone: body.tone });
    await audit({ userId: user.id, action: "item.drafts.regenerated", entityType: "item", entityId: item.id, meta: { drafts: out.derived.length + 1, generatedBy: out.generatedBy, verdict: out.selfCheck.verdict }, ...requestMeta(req) });
    const drafts = await listDrafts(item.id);
    return json({ drafts: drafts.map(toDraftDTO), selfCheck: out.selfCheck, generatedBy: out.generatedBy });
  },
  { rateLimit: { key: "drafts-regenerate", limit: 10, windowSeconds: 600 } },
);
