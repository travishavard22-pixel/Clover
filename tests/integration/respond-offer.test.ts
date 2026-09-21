import { afterAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Applying an offer-autopilot proposal is the only automation branch that sells something. The
 * evaluator decided from a snapshot that may be minutes old, so `applyRespondOffer` re-reads every
 * number it was given and refuses when any of them moved. Those refusals are what is pinned here,
 * against a real database — a guard that only exists in a mock is a guard that ships broken.
 *
 * FACEBOOK is used throughout because it is assisted: there is no marketplace API to reach, so the
 * test exercises Clover's own bookkeeping without touching a network.
 */
describe("applying an offer-autopilot proposal", async () => {
  const { db } = await import("@/lib/db");
  const { executeProposal } = await import("@/lib/automations/apply");

  const tag = `respond-${Date.now()}`;
  let userId = "";
  let itemId = "";

  const proposal = (over: Record<string, unknown> = {}) => ({
    key: `autopilot:x:accept`,
    action: "respond_offer" as const,
    itemId,
    offerId: "",
    response: "decline" as const,
    counterCents: null,
    offerCents: 6000,
    askCents: 10_000,
    reason: "Below your floor.",
    ...over,
  });

  async function makeOffer(over: Record<string, unknown> = {}) {
    return db.offer.create({ data: { userId, itemId, marketplace: "FACEBOOK", buyerName: "Dana", amount: 6000, originalPrice: 10_000, status: "PENDING", ...over } });
  }

  beforeEach(async () => {
    if (!userId) {
      const user = await db.user.create({ data: { id: `${tag}-user`, email: `${tag}@example.test`, name: "Offer Test", emailVerified: false } });
      userId = user.id;
      const item = await db.item.create({ data: { userId, sku: `${tag}-sku`, title: "Leica M6", status: "OFFER_RECEIVED", listPrice: 10_000, floorPrice: 8000 } });
      itemId = item.id;
    }
    await db.offer.deleteMany({ where: { userId } });
    await db.item.update({ where: { id: itemId }, data: { status: "OFFER_RECEIVED", listPrice: 10_000, floorPrice: 8000 } });
  });

  afterAll(async () => {
    if (userId) await db.user.delete({ where: { id: userId } }).catch(() => {});
    await db.$disconnect();
  });

  it("records the reply and says the seller still has to send it on an assisted marketplace", async () => {
    const offer = await makeOffer();
    const result = await executeProposal(userId, proposal({ offerId: offer.id }), { source: "auto" });

    expect(result.action).toBe("respond_offer");
    expect(result.manual).toEqual(["FACEBOOK"]);
    expect(result.summary).toContain("yourself");
    expect((await db.offer.findUnique({ where: { id: offer.id } }))!.status).toBe("DECLINED");
    // No pending offers left, so the item goes back to plain LISTED.
    expect((await db.item.findUnique({ where: { id: itemId } }))!.status).toBe("LISTED");
  });

  it("refuses when the buyer changed their offer since the sweep read it", async () => {
    const offer = await makeOffer({ amount: 7500 });
    await expect(executeProposal(userId, proposal({ offerId: offer.id }), { source: "auto" })).rejects.toMatchObject({ code: "stale_proposal" });
    expect((await db.offer.findUnique({ where: { id: offer.id } }))!.status).toBe("PENDING");
  });

  it("refuses when the asking price moved since the sweep read it", async () => {
    const offer = await makeOffer({ originalPrice: 12_000 });
    await expect(executeProposal(userId, proposal({ offerId: offer.id }), { source: "auto" })).rejects.toMatchObject({ code: "stale_proposal" });
  });

  it("refuses to accept below the floor even if the proposal says to", async () => {
    // The evaluator would never propose this; the point is that apply does not trust it.
    const offer = await makeOffer();
    await expect(executeProposal(userId, proposal({ offerId: offer.id, response: "accept" }), { source: "auto" })).rejects.toMatchObject({ code: "below_floor" });
    expect((await db.item.findUnique({ where: { id: itemId } }))!.status).toBe("OFFER_RECEIVED");
  });

  it("refuses to counter below the floor", async () => {
    const offer = await makeOffer();
    await expect(executeProposal(userId, proposal({ offerId: offer.id, response: "counter", counterCents: 7000 }), { source: "auto" })).rejects.toMatchObject({ code: "below_floor" });
  });

  it("refuses an offer that was already answered", async () => {
    const offer = await makeOffer({ status: "DECLINED" });
    await expect(executeProposal(userId, proposal({ offerId: offer.id }), { source: "auto" })).rejects.toMatchObject({ code: "bad_status" });
  });

  it("refuses an offer belonging to someone else", async () => {
    const offer = await makeOffer();
    await expect(executeProposal(`${tag}-nobody`, proposal({ offerId: offer.id }), { source: "auto" })).rejects.toMatchObject({ code: "not_found" });
  });

  it("counters above the floor, and records the amount", async () => {
    const offer = await makeOffer();
    const result = await executeProposal(userId, proposal({ offerId: offer.id, response: "counter", counterCents: 9000 }), { source: "auto" });
    expect(result.summary).toContain("$90.00");
    const after = await db.offer.findUnique({ where: { id: offer.id } });
    expect(after).toMatchObject({ status: "COUNTERED", counterAmount: 9000 });
  });
});
