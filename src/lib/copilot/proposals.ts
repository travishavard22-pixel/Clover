import { z } from "zod";
import { db, Prisma, type Marketplace } from "../db";
import { ApiError } from "../api";
import { audit } from "../audit";
import { executeProposal, type ApplyResult } from "../automations/apply";
import { parseTrace } from "./threads";

const MarketplaceSchema = z.enum(["EBAY", "FACEBOOK", "OFFERUP", "NEXTDOOR", "CRAIGSLIST", "MERCARI", "POSHMARK"]);

/** Proposals the Copilot's tools can return. Each one is rendered as an action card the seller confirms. */
export const CopilotProposalSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("price_change"),
    id: z.string().min(1).max(64),
    itemId: z.string().min(1).max(64),
    itemTitle: z.string().max(300),
    fromCents: z.number().int().min(0),
    toCents: z.number().int().min(100).max(100_000_000),
    reason: z.string().max(500),
    warnings: z.array(z.string().max(300)).max(20).default([]),
  }),
  z.object({
    kind: z.literal("rewrite_listing"),
    id: z.string().min(1).max(64),
    itemId: z.string().min(1).max(64),
    itemTitle: z.string().max(300),
    marketplace: MarketplaceSchema.nullable(),
    draftId: z.string().max(64).nullable(),
    instruction: z.string().max(500),
    from: z.object({ title: z.string().max(200), description: z.string().max(20_000) }),
    to: z.object({ title: z.string().max(200), description: z.string().max(20_000), bullets: z.array(z.string().max(400)).max(40).default([]), conditionText: z.string().max(4_000).default(""), keywords: z.array(z.string().max(80)).max(80).default([]) }),
    selfCheck: z.object({ verdict: z.enum(["pass", "revise", "reject"]), unsupportedCount: z.number().int().min(0) }).nullable(),
    generatedBy: z.string().max(120),
  }),
]);
export type CopilotProposal = z.infer<typeof CopilotProposalSchema>;

export const ApplyProposalSchema = z.object({ threadId: z.string().min(1).max(64).optional(), proposal: CopilotProposalSchema });

/**
 * The proposal as the copilot actually produced it, read back from the conversation's stored tool
 * trace. Applying from this record — rather than from whatever the browser posted — means a
 * confirmation can only execute something the copilot raised.
 */
export async function findStoredProposal(threadId: string, proposalId: string): Promise<CopilotProposal | null> {
  const messages = await db.copilotMessage.findMany({ where: { threadId, role: "assistant" }, select: { toolTrace: true }, orderBy: { createdAt: "desc" }, take: 200 });
  for (const m of messages) {
    const trace = parseTrace(m.toolTrace);
    const found = trace?.proposals.find((p) => p.id === proposalId);
    if (found) {
      const parsed = CopilotProposalSchema.safeParse(found);
      if (parsed.success) return parsed.data;
    }
  }
  return null;
}

export type CopilotApplyResult = { summary: string; manual: Marketplace[]; jobIds: string[] };

/** Applies a confirmed proposal. Re-validates ownership and the precondition (current price / current title). */
export async function applyCopilotProposal(userId: string, proposal: CopilotProposal, meta: { ip?: string | null; userAgent?: string | null }): Promise<CopilotApplyResult> {
  if (proposal.kind === "price_change") {
    const item = await db.item.findFirst({ where: { id: proposal.itemId, userId }, select: { id: true, listPrice: true, status: true } });
    if (!item) throw new ApiError(404, "Item not found", "not_found");
    if (item.listPrice === null) {
      if (item.status !== "READY" && item.status !== "DRAFT") throw new ApiError(409, "This item has no list price to change.", "stale_proposal");
      await db.item.update({ where: { id: item.id }, data: { listPrice: proposal.toCents } });
      await audit({ userId, action: "item.reprice", entityType: "item", entityId: item.id, meta: { from: null, to: proposal.toCents, source: "copilot", reason: proposal.reason }, ...meta });
      return { summary: `Price set to $${(proposal.toCents / 100).toFixed(2)}.`, manual: [], jobIds: [] };
    }
    if (proposal.toCents > item.listPrice) {
      return raise(userId, item.id, item.listPrice, proposal.toCents, proposal.reason, meta);
    }
    const result: ApplyResult = await executeProposal(
      userId,
      { key: `copilot:${proposal.id}`, action: "reprice", itemId: item.id, fromCents: proposal.fromCents, toCents: proposal.toCents, publicationIds: [], apiPublicationIds: [], reason: `Copilot: ${proposal.reason}` },
      { source: "user", ...meta },
    );
    return { summary: result.summary, manual: result.manual, jobIds: result.jobIds };
  }

  // rewrite_listing
  const item = await db.item.findFirst({ where: { id: proposal.itemId, userId }, select: { id: true, title: true, status: true } });
  if (!item) throw new ApiError(404, "Item not found", "not_found");
  const draft = proposal.draftId ? await db.listingDraft.findFirst({ where: { id: proposal.draftId, itemId: item.id } }) : await db.listingDraft.findFirst({ where: { itemId: item.id, marketplace: proposal.marketplace } });
  if (draft) {
    if (draft.title !== proposal.from.title || draft.description !== proposal.from.description) throw new ApiError(409, "The listing was edited since this rewrite was proposed. Ask for a fresh rewrite.", "stale_proposal");
    await db.$transaction([
      db.listingDraftVersion.create({ data: { draftId: draft.id, version: draft.version, snapshot: { title: draft.title, description: draft.description, bullets: draft.bullets, conditionText: draft.conditionText, specifics: draft.specifics as Prisma.InputJsonValue, keywords: draft.keywords, categoryPath: draft.categoryPath, categoryId: draft.categoryId, price: draft.price, shipping: draft.shipping as Prisma.InputJsonValue }, reason: `Copilot rewrite: ${proposal.instruction}` } }),
      db.listingDraft.update({ where: { id: draft.id }, data: { title: proposal.to.title, description: proposal.to.description, bullets: proposal.to.bullets, conditionText: proposal.to.conditionText || draft.conditionText, keywords: proposal.to.keywords.length ? proposal.to.keywords : draft.keywords, version: { increment: 1 }, generatedBy: proposal.generatedBy, selfCheck: (proposal.selfCheck ?? Prisma.DbNull) as Prisma.InputJsonValue } }),
    ]);
    if (draft.marketplace === null) await db.item.update({ where: { id: item.id }, data: { title: proposal.to.title } });
  } else {
    await db.listingDraft.create({ data: { itemId: item.id, marketplace: proposal.marketplace, title: proposal.to.title, description: proposal.to.description, bullets: proposal.to.bullets, conditionText: proposal.to.conditionText, keywords: proposal.to.keywords, generatedBy: proposal.generatedBy } });
    if (proposal.marketplace === null) await db.item.update({ where: { id: item.id }, data: { title: proposal.to.title } });
  }
  await audit({ userId, action: "listing.rewritten", entityType: "item", entityId: item.id, meta: { marketplace: proposal.marketplace, instruction: proposal.instruction, source: "copilot" }, ...meta });
  const live = await db.publication.count({ where: { itemId: item.id, status: "PUBLISHED" } });
  return { summary: `Listing draft updated.${live ? " Live listings keep their current copy until you republish." : ""}`, manual: [], jobIds: [] };
}

async function raise(userId: string, itemId: string, from: number, to: number, reason: string, meta: { ip?: string | null; userAgent?: string | null }): Promise<CopilotApplyResult> {
  // Raising a price is reversible and never conflicts with a floor; API listings are synced like a drop.
  const item = await db.item.findFirst({ where: { id: itemId, userId } });
  if (!item || item.listPrice !== from) throw new ApiError(409, "The price changed since this was proposed.", "stale_proposal");
  const attributes = item.attributes && typeof item.attributes === "object" && !Array.isArray(item.attributes) ? { ...(item.attributes as Record<string, unknown>) } : {};
  const history = Array.isArray(attributes.priceHistory) ? (attributes.priceHistory as unknown[]) : [];
  attributes.priceHistory = [...history.slice(-19), { at: new Date().toISOString(), from, to, source: "copilot", reason }];
  attributes.lastRepricedAt = new Date().toISOString();
  await db.item.update({ where: { id: itemId }, data: { listPrice: to, attributes: attributes as Prisma.InputJsonValue } });
  await db.listingDraft.updateMany({ where: { itemId }, data: { price: to } });
  const pubs = await db.publication.findMany({ where: { itemId, userId, status: "PUBLISHED" } });
  const { enqueueJob } = await import("../jobs/queue");
  const { MARKETPLACES } = await import("../marketplaces/registry");
  const jobIds: string[] = [];
  const manual: Marketplace[] = [];
  for (const p of pubs) {
    if (p.mode === "API") {
      const job = await enqueueJob("SYNC_MARKETPLACE", { userId, marketplace: p.marketplace, updatePublicationId: p.id, priceCents: to }, { userId, itemId, steps: [{ key: "update", label: `Updating the ${MARKETPLACES[p.marketplace].name} price` }] });
      jobIds.push(job.id);
    } else manual.push(p.marketplace);
  }
  await audit({ userId, action: "item.reprice", entityType: "item", entityId: itemId, meta: { from, to, source: "copilot", reason, jobIds, manual }, ...meta });
  return { summary: `${item.title} is now $${(to / 100).toFixed(2).replace(/\.00$/, "")}.${manual.length ? ` Update ${manual.map((m) => MARKETPLACES[m].name).join(" and ")} by hand.` : ""}`, manual, jobIds };
}
