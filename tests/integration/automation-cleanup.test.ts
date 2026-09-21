import { afterAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Two kinds of recommendation outlive the problem that created them, and both fail quietly: an
 * offer the buyer withdrew, and a connection the seller reconnected. Nothing tells Clover either
 * happened, so the sweep has to notice — otherwise "Needs attention" fills with things that are
 * already fine and the seller stops reading it.
 */
describe("the sweep's cleanup of resolved recommendations", async () => {
  const { db } = await import("@/lib/db");
  const { runAutomationsForUser } = await import("@/lib/automations/engine");

  const tag = `sweep-${Date.now()}`;
  let userId = "";
  let itemId = "";

  beforeEach(async () => {
    if (!userId) {
      const user = await db.user.create({ data: { id: `${tag}-user`, email: `${tag}@example.test`, name: "Sweep Test", emailVerified: false } });
      userId = user.id;
      const item = await db.item.create({ data: { userId, sku: `${tag}-sku`, title: "Leica M6", status: "LISTED", listPrice: 10_000, floorPrice: 8000 } });
      itemId = item.id;
    }
    await db.recommendation.deleteMany({ where: { userId } });
    await db.offer.deleteMany({ where: { userId } });
    await db.marketplaceConnection.deleteMany({ where: { userId } });
    await db.notification.deleteMany({ where: { userId } });
  });

  afterAll(async () => {
    if (userId) await db.user.delete({ where: { id: userId } }).catch(() => {});
    await db.$disconnect();
  });

  it("dismisses an offer recommendation once the offer stops being pending", async () => {
    const offer = await db.offer.create({ data: { userId, itemId, marketplace: "FACEBOOK", buyerName: "Dana", amount: 9600, originalPrice: 10_000, status: "DECLINED" } });
    const rec = await db.recommendation.create({ data: { userId, itemId, type: "OFFER_ALERT", title: "$96.00 offer", body: "…", proposal: { key: `offer:${offer.id}`, action: "notify", itemId, href: "/offers" }, status: "OPEN" } });

    await runAutomationsForUser(userId);
    expect((await db.recommendation.findUnique({ where: { id: rec.id } }))!.status).toBe("DISMISSED");
  });

  it("leaves an offer recommendation alone while the offer is still pending", async () => {
    const offer = await db.offer.create({ data: { userId, itemId, marketplace: "FACEBOOK", buyerName: "Dana", amount: 9600, originalPrice: 10_000, status: "PENDING" } });
    const rec = await db.recommendation.create({ data: { userId, itemId, type: "OFFER_ALERT", title: "$96.00 offer", body: "…", proposal: { key: `offer:${offer.id}`, action: "notify", itemId, href: "/offers" }, status: "OPEN" } });

    await runAutomationsForUser(userId);
    expect((await db.recommendation.findUnique({ where: { id: rec.id } }))!.status).toBe("OPEN");
  });

  it("raises a broken connection, then dismisses it once it is reconnected", async () => {
    await db.marketplaceConnection.create({ data: { userId, marketplace: "EBAY", status: "NEEDS_REAUTH", mode: "api", lastError: "eBay authorization expired or was revoked." } });

    const first = await runAutomationsForUser(userId);
    expect(first.byType.CONNECTION_HEALTH?.proposals).toBe(1);
    const rec = await db.recommendation.findFirst({ where: { userId, type: "CONNECTION_HEALTH" } });
    expect(rec).not.toBeNull();
    // Notify-only, so the sweep records it as applied rather than leaving a button to press.
    expect(rec!.status).toBe("APPLIED");

    // A reconnection fixes it silently, so an OPEN card would sit there next to a working eBay.
    await db.recommendation.update({ where: { id: rec!.id }, data: { status: "OPEN", resolvedAt: null } });
    await db.marketplaceConnection.updateMany({ where: { userId, marketplace: "EBAY" }, data: { status: "CONNECTED", lastError: null } });

    const second = await runAutomationsForUser(userId);
    expect(second.resolved).toBeGreaterThanOrEqual(1);
    expect((await db.recommendation.findUnique({ where: { id: rec!.id } }))!.status).toBe("DISMISSED");
  });

  it("keeps a broken connection's recommendation while it is still broken", async () => {
    await db.marketplaceConnection.create({ data: { userId, marketplace: "EBAY", status: "NEEDS_REAUTH", mode: "api" } });
    await runAutomationsForUser(userId);
    const rec = await db.recommendation.findFirst({ where: { userId, type: "CONNECTION_HEALTH" } });
    await db.recommendation.update({ where: { id: rec!.id }, data: { status: "OPEN", resolvedAt: null } });

    await runAutomationsForUser(userId);
    expect((await db.recommendation.findUnique({ where: { id: rec!.id } }))!.status).toBe("OPEN");
  });
});
