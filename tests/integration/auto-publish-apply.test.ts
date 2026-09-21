import { afterAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Applying an auto-publish proposal puts a listing in front of strangers, so it re-checks the two
 * things the evaluator was looking at when it decided: the item is still waiting to be listed, and
 * the price is still the one that was reviewed. A sweep that ran ten minutes ago must not list an
 * item at a price the seller has since changed.
 *
 * Assisted marketplaces do the real work here: publishing to one builds the seller's checklist
 * without touching a network, so the whole path is exercised for real.
 */
describe("applying an auto-publish proposal", async () => {
  const { db } = await import("@/lib/db");
  const { executeProposal } = await import("@/lib/automations/apply");

  const tag = `pub-${Date.now()}`;
  let userId = "";
  let itemId = "";

  const proposal = (over: Record<string, unknown> = {}) => ({
    key: `publish:${itemId}:10000:FACEBOOK`,
    action: "publish" as const,
    itemId,
    marketplaces: ["FACEBOOK" as const],
    priceCents: 10_000,
    reason: "identified with 92% confidence",
    ...over,
  });

  beforeEach(async () => {
    if (!userId) {
      const user = await db.user.create({ data: { id: `${tag}-user`, email: `${tag}@example.test`, name: "Publish Test", emailVerified: false } });
      userId = user.id;
      const item = await db.item.create({ data: { userId, sku: `${tag}-sku`, title: "Leica M6", status: "READY", listPrice: 10_000, floorPrice: 8000, conditionGrade: "GOOD" } });
      itemId = item.id;
      await db.photo.create({ data: { itemId, kind: "ORIGINAL", storageKey: `${tag}/p1.jpg`, thumbKey: null, width: 2000, height: 1500, bytes: 1000, mimeType: "image/jpeg", sortOrder: 0 } });
    }
    await db.publication.deleteMany({ where: { userId } });
    await db.job.deleteMany({ where: { userId } });
    await db.item.update({ where: { id: itemId }, data: { status: "READY", listPrice: 10_000 } });
  });

  afterAll(async () => {
    if (userId) await db.user.delete({ where: { id: userId } }).catch(() => {});
    await db.$disconnect();
  });

  it("refuses when the price changed since the sweep read it", async () => {
    await db.item.update({ where: { id: itemId }, data: { listPrice: 12_000 } });
    await expect(executeProposal(userId, proposal(), { source: "auto" })).rejects.toMatchObject({ code: "stale_proposal" });
    expect(await db.publication.count({ where: { itemId } })).toBe(0);
  });

  it("refuses when the item is no longer waiting to be listed", async () => {
    await db.item.update({ where: { id: itemId }, data: { status: "SOLD" } });
    await expect(executeProposal(userId, proposal(), { source: "auto" })).rejects.toMatchObject({ code: "stale_proposal" });
  });

  it("refuses an item belonging to someone else", async () => {
    await expect(executeProposal(`${tag}-nobody`, proposal(), { source: "auto" })).rejects.toMatchObject({ code: "not_found" });
  });

  it("prepares the assisted checklist and says the seller finishes it", async () => {
    const result = await executeProposal(userId, proposal(), { source: "auto" });
    expect(result.action).toBe("publish");
    expect(result.manual).toEqual(["FACEBOOK"]);
    expect(result.jobIds).toEqual([]);
    expect(result.summary).toContain("no publish API");

    const pub = await db.publication.findFirst({ where: { itemId, marketplace: "FACEBOOK" } });
    expect(pub).toMatchObject({ mode: "ASSISTED", status: "REQUIRES_USER_ACTION", price: 10_000 });
  });

  it("reports the marketplaces it could not publish to instead of aborting the rest", async () => {
    // eBay is not connected for this seller. The proposal asks for both; Facebook still goes out.
    const result = await executeProposal(userId, proposal({ marketplaces: ["EBAY", "FACEBOOK"] }), { source: "auto" });
    expect(result.manual).toEqual(["FACEBOOK"]);
    expect(result.summary).toContain("Skipped eBay");
    expect(await db.publication.count({ where: { itemId, marketplace: "EBAY" } })).toBe(0);
  });

  it("refuses with the marketplace's own reason when nothing could be published", async () => {
    await expect(executeProposal(userId, proposal({ marketplaces: ["EBAY"] }), { source: "auto" })).rejects.toMatchObject({ code: "publish_refused" });
  });
});
