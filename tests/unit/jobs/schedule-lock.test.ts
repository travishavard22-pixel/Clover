import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Every worker runs the heartbeat, so the "is anything due?" check has to be serialised across
 * processes or two workers both find nothing queued and both enqueue.
 *
 * This pins the protection rather than trying to reproduce the race: an integration test that
 * fires two calls at once passed with the lock removed — the calls did not interleave — which is
 * exactly the kind of test that proves nothing while looking reassuring.
 */
const calls: string[] = [];
const created: Array<{ type: string; userId: string | null }> = [];

vi.mock("@/lib/db", () => {
  const tx = {
    $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push(`sql:${strings.join("?")}|${values.join(",")}`);
      return Promise.resolve(1);
    },
    job: {
      create: ({ data }: { data: { type: string; userId?: string | null } }) => {
        calls.push(`create:${data.type}`);
        created.push({ type: data.type, userId: data.userId ?? null });
        return Promise.resolve({ id: `job-${created.length}` });
      },
    },
  };
  return {
    db: {
      $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
      job: { findFirst: () => Promise.resolve(null) },
      marketplaceConnection: { findMany: () => Promise.resolve([{ userId: "seller-1" }]) },
    },
    Prisma: {},
  };
});

describe("the scheduler's due check", () => {
  beforeEach(() => {
    calls.length = 0;
    created.length = 0;
  });

  it("takes the advisory lock before it writes anything", async () => {
    const { enqueueDueJobs } = await import("@/lib/jobs/schedule");
    await enqueueDueJobs(new Date());

    const lock = calls.findIndex((c) => c.startsWith("sql:") && c.includes("pg_advisory_xact_lock"));
    const firstWrite = calls.findIndex((c) => c.startsWith("create:"));
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(firstWrite).toBeGreaterThan(lock);
  });

  it("locks inside the same transaction as the writes", async () => {
    const { enqueueDueJobs } = await import("@/lib/jobs/schedule");
    await enqueueDueJobs(new Date());
    // A transaction-scoped lock is released when the transaction ends, including on a throw. A
    // session lock taken outside it would leak on failure and wedge every other worker.
    expect(calls.some((c) => c.includes("pg_advisory_xact_lock"))).toBe(true);
    expect(calls.some((c) => c.includes("pg_advisory_lock("))).toBe(false);
  });

  it("queues a sync per connected seller and one sweep for everyone", async () => {
    const { enqueueDueJobs } = await import("@/lib/jobs/schedule");
    const result = await enqueueDueJobs(new Date());
    expect(result).toEqual({ syncs: 1, automations: 1 });
    expect(created).toEqual([
      { type: "SYNC_MARKETPLACE", userId: "seller-1" },
      // The sweep covers every seller in one job, so it carries no user.
      { type: "RUN_AUTOMATIONS", userId: null },
    ]);
  });
});
