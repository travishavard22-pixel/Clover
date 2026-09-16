import { z } from "zod";
import { ApiError, json, parseBody, withUser } from "@/lib/api";
import { audit, requestMeta } from "@/lib/audit";
import { applyAlternative, applyFieldEdit, parseStoredProfile, type EditableKey, type EditResult } from "@/lib/ai/profile-edit";
import { db, Prisma } from "@/lib/db";
import { getOwnedItem } from "@/lib/items/access";
import { buildItemSummary } from "@/lib/items/summary";
import { userEdited } from "@/lib/jobs/handlers/analyze-item";
import { recomputeEstimate } from "@/lib/pricing/service";

const FieldSchema = z.object({
  field: z.string().trim().min(1).max(120),
  value: z.string().max(500),
});
const PickSchema = z.object({ pickAlternative: z.number().int().min(0).max(50) });
const BodySchema = z.union([FieldSchema, PickSchema]);

/**
 * PATCH /api/items/[id]/profile
 *   { field, value }            — set one identification field ("itemName" | "brand" | … | "categoryPath" | "attribute:<name>")
 *   { pickAlternative: index }  — adopt one of the AI's alternative identifications
 * → { item, profile, estimate, comps } (the refreshed summary slices)
 * The edit is marked as verified by the seller and mirrored onto the Item so a re-analysis never
 * overwrites it. Identity edits re-run the price estimate because comparables are matched on them.
 */
export const PATCH = withUser<{ id: string }>(
  async (req, { user, params }) => {
    const body = await parseBody(req, BodySchema);
    const item = await getOwnedItem(user.id, params.id);
    const row = await db.itemProfile.findUnique({ where: { itemId: item.id } });
    const current = row ? parseStoredProfile(row.data) : null;
    if (!current) throw new ApiError(409, "This item has not been identified yet. Run analysis first.", "no_profile");

    let result: EditResult;
    try {
      result = "pickAlternative" in body ? applyAlternative(current, body.pickAlternative) : applyFieldEdit(current, body.field as EditableKey, body.value);
    } catch (err) {
      throw new ApiError(400, err instanceof Error ? err.message : "Invalid edit", "validation");
    }

    const attrs = (item.attributes && typeof item.attributes === "object" && !Array.isArray(item.attributes) ? item.attributes : {}) as Record<string, unknown>;
    const specifics = { ...((attrs.specifics as Record<string, string> | undefined) ?? {}) };
    for (const [name, value] of Object.entries(result.mirror.specifics ?? {})) {
      if (value === null) delete specifics[name];
      else specifics[name] = value;
    }
    const edited = new Set([...userEdited(attrs), ...result.mirror.userEdited]);
    const itemData: Prisma.ItemUpdateInput = { attributes: { ...attrs, specifics, userEdited: [...edited] } as Prisma.InputJsonValue };
    if (result.mirror.title !== undefined) itemData.title = result.mirror.title;
    if (result.mirror.brand !== undefined) itemData.brand = result.mirror.brand;
    if (result.mirror.model !== undefined) itemData.model = result.mirror.model;
    if (result.mirror.categoryPath !== undefined) itemData.categoryPath = result.mirror.categoryPath;

    await db.$transaction([
      db.itemProfile.update({
        where: { itemId: item.id },
        data: { data: result.profile as unknown as Prisma.InputJsonValue, identityConfidence: result.profile.identityConfidence, conditionConfidence: result.profile.condition.confidence },
      }),
      db.item.update({ where: { id: item.id }, data: itemData }),
    ]);
    if (result.identityChanged && (await db.priceEstimate.findUnique({ where: { itemId: item.id }, select: { itemId: true } }))) {
      await recomputeEstimate(item.id);
    }
    await audit({
      userId: user.id,
      action: "pickAlternative" in body ? "item.profile.alternative" : "item.profile.edit",
      entityType: "item",
      entityId: item.id,
      meta: "pickAlternative" in body ? { index: body.pickAlternative } : { field: body.field, cleared: body.value.trim() === "" },
      ...requestMeta(req),
    });

    const summary = await buildItemSummary(user.id, item.id);
    return json({ item: summary.item, profile: summary.profile, estimate: summary.estimate, comps: summary.comps });
  },
  { rateLimit: { key: "profile-edit", limit: 240, windowSeconds: 600 } },
);
