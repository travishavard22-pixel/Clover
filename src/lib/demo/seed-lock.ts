import { Client } from "pg";
import { env } from "../env";

/**
 * Cross-process mutex for the demo seed, so two containers booting at once cannot corrupt each
 * other. Without it the loser's `deleteMany` removes items the winner is still attaching photos to,
 * and the winner dies on `Photo_itemId_fkey`.
 *
 * The lock lives on its own connection rather than going through Prisma: a PostgreSQL session
 * advisory lock belongs to the connection that took it, and Prisma hands out pooled connections, so
 * consecutive `$queryRaw` calls can land on different ones — releasing nothing and leaking a locked
 * connection back into the pool.
 */

// Fixed, arbitrary key ("Clvr" as int32) — shared by every process seeding this database.
const LOCK_KEY = 0x436c7672;

export type SeedLock = { release: () => Promise<void> };

/** Takes the lock without waiting. Returns null when another process already holds it. */
export async function acquireSeedLock(): Promise<SeedLock | null> {
  const client = new Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  try {
    const res = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock($1) AS locked", [LOCK_KEY]);
    if (!res.rows[0]?.locked) {
      await client.end();
      return null;
    }
  } catch (err) {
    await client.end().catch(() => {});
    throw err;
  }
  return {
    release: async () => {
      try {
        await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
      } catch {
        // Closing the connection drops the lock anyway; never mask the seed's own outcome.
      } finally {
        await client.end().catch(() => {});
      }
    },
  };
}
