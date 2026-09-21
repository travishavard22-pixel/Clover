import { afterAll, beforeEach, describe, expect, it } from "vitest";

/**
 * The heartbeat decides, on its own, when the unattended work runs. The failure modes are both
 * quiet — never enqueueing (a deployment that looks healthy and does nothing) and enqueueing every
 * tick (a queue of syncs that burns marketplace quota) — so both are pinned here against a real
 * database.
 *
 * The two-worker race is *not* tested here. Firing two calls at once from one client passed with
 * the advisory lock removed — the calls simply did not interleave — so it proved nothing. The lock
 * itself is pinned in tests/unit/jobs/schedule-lock.test.ts.
 */
describe("scheduled work", async () => {
  const { db } = await import("@/lib/db");
  const { enqueueDueJobs, isDue, sellersToSync, syncMinutes, sweepMinutes } = await import("@/lib/jobs/schedule");

  const tag = `sched-${Date.now()}`;
  let userId = "";

  const reset = async () => {
    await db.job.deleteMany({ where: { OR: [{ userId }, { userId: null, type: "RUN_AUTOMATIONS" }] } });
  };

  beforeEach(async () => {
    if (!userId) {
      const user = await db.user.create({ data: { id: `${tag}-user`, email: `${tag}@example.test`, name: "Schedule Test", emailVerified: false } });
      userId = user.id;
      await db.marketplaceConnection.create({ data: { userId, marketplace: "EBAY", status: "CONNECTED", mode: "api" } });
    }
    await reset();
  });

  afterAll(async () => {
    if (userId) {
      await reset();
      await db.user.delete({ where: { id: userId } }).catch(() => {});
    }
    await db.$disconnect();
  });

  it("queues a sync for a connected seller and a sweep for everyone", async () => {
    const result = await enqueueDueJobs();
    expect(result.syncs).toBeGreaterThanOrEqual(1);
    expect(result.automations).toBe(1);

    const sync = await db.job.findFirst({ where: { userId, type: "SYNC_MARKETPLACE" } });
    expect(sync).not.toBeNull();
    // Marked as the heartbeat's, so a seller pressing Sync is never mistaken for one.
    expect((sync!.payload as { scheduled?: boolean }).scheduled).toBe(true);
    expect((sync!.payload as { userId?: string }).userId).toBe(userId);
  });

  it("does not stack work while the last run is still queued", async () => {
    await enqueueDueJobs();
    const second = await enqueueDueJobs();
    expect(second).toEqual({ syncs: 0, automations: 0 });
    expect(await db.job.count({ where: { userId, type: "SYNC_MARKETPLACE" } })).toBe(1);
  });

  it("comes due again once the interval has passed since the last finish", async () => {
    await enqueueDueJobs();
    const job = await db.job.findFirstOrThrow({ where: { userId, type: "SYNC_MARKETPLACE" } });
    const finishedAt = new Date(Date.now() - (syncMinutes() + 1) * 60_000);
    await db.job.update({ where: { id: job.id }, data: { status: "SUCCEEDED", finishedAt } });

    expect(await isDue("SYNC_MARKETPLACE", userId, syncMinutes(), new Date())).toBe(true);
    const again = await enqueueDueJobs();
    expect(again.syncs).toBeGreaterThanOrEqual(1);
  });

  it("stays quiet when the last run finished inside the interval", async () => {
    await enqueueDueJobs();
    const job = await db.job.findFirstOrThrow({ where: { userId, type: "SYNC_MARKETPLACE" } });
    await db.job.update({ where: { id: job.id }, data: { status: "SUCCEEDED", finishedAt: new Date() } });
    expect(await isDue("SYNC_MARKETPLACE", userId, syncMinutes(), new Date())).toBe(false);
  });

  it("only syncs sellers Clover can actually call", async () => {
    const ids = await sellersToSync();
    expect(ids).toContain(userId);

    // An assisted-only connection has no API to pull from; syncing it would be a no-op job forever.
    const assisted = await db.user.create({ data: { id: `${tag}-assisted`, email: `${tag}-assisted@example.test`, name: "Assisted", emailVerified: false } });
    await db.marketplaceConnection.create({ data: { userId: assisted.id, marketplace: "FACEBOOK", status: "CONNECTED", mode: "assisted" } });
    expect(await sellersToSync()).not.toContain(assisted.id);
    await db.user.delete({ where: { id: assisted.id } });
  });

  it("keeps the intervals inside sane bounds", () => {
    expect(syncMinutes()).toBeGreaterThanOrEqual(5);
    expect(sweepMinutes()).toBeGreaterThanOrEqual(5);
    expect(syncMinutes()).toBeLessThanOrEqual(1440);
  });
});
