import type { registerJobHandler } from "../runner";
import { db } from "../../db";
import { audit } from "../../audit";
import { MARKETPLACES } from "../../marketplaces/registry";
import { storage } from "../../storage";

type Payload = { userId: string; emailHash: string; requestedAt?: string };

export type ListingToEnd = { marketplace: string; marketplaceName: string; itemTitle: string; externalUrl: string | null; mode: "API" | "ASSISTED" };

export type DeleteAccountResult = {
  emailHash: string;
  listingsToEnd: ListingToEnd[];
  filesDeleted: number;
  filesFailed: number;
  items: number;
};

export const DELETE_STEPS = [
  { key: "listings", label: "Listing marketplace listings you should end" },
  { key: "storage", label: "Deleting stored photos and exports" },
  { key: "account", label: "Deleting the account" },
  { key: "audit", label: "Recording the deletion" },
];

const STILL_OPEN = new Set(["READY", "NEEDS_ATTENTION", "PUBLISHING", "PUBLISHED", "REQUIRES_USER_ACTION"]);

/**
 * DELETE_ACCOUNT — payload `{ userId, emailHash }`. The job is enqueued WITHOUT a userId so it
 * survives the cascade. It records the live marketplace listings the seller must end by hand
 * (Clover cannot act for them once the connection is gone), deletes every stored object, deletes
 * the user (Prisma cascades sessions, items, photos, connections, threads…) and writes an audit
 * entry that identifies the account only by a salted hash of the email.
 */
export function register(r: typeof registerJobHandler) {
  r<Payload, DeleteAccountResult>("DELETE_ACCOUNT", async (ctx) => {
    const { userId, emailHash } = ctx.payload;
    if (!userId || !emailHash) throw new Error("DELETE_ACCOUNT needs userId and emailHash");
    const result: DeleteAccountResult = { emailHash, listingsToEnd: [], filesDeleted: 0, filesFailed: 0, items: 0 };

    const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) {
      await ctx.log("Account already deleted");
      return result;
    }

    await ctx.step("listings", "Listing marketplace listings you should end", async (report) => {
      const pubs = await db.publication.findMany({ where: { userId, status: { in: [...STILL_OPEN] as never[] } }, include: { item: { select: { title: true } } } });
      result.listingsToEnd = pubs.map((p) => ({ marketplace: p.marketplace, marketplaceName: MARKETPLACES[p.marketplace].name, itemTitle: p.item.title, externalUrl: p.externalUrl, mode: p.mode }));
      await report(result.listingsToEnd.length ? `${result.listingsToEnd.length} live listing${result.listingsToEnd.length === 1 ? "" : "s"} recorded` : "No live listings", { listings: result.listingsToEnd });
    });

    const keys = await ctx.step("storage", "Deleting stored photos and exports", async (report) => {
      const photos = await db.photo.findMany({ where: { item: { userId } }, select: { storageKey: true, thumbKey: true, provenance: true } });
      const exportJobs = await db.job.findMany({ where: { userId, type: "EXPORT_DATA", status: "SUCCEEDED" }, select: { result: true } });
      const set = new Set<string>();
      for (const p of photos) {
        set.add(p.storageKey);
        if (p.thumbKey) set.add(p.thumbKey);
        const prov = p.provenance as { originalKey?: unknown } | null;
        if (typeof prov?.originalKey === "string") set.add(prov.originalKey);
        // Derivatives share the photo prefix; the web variant is the storageKey, the original is recorded in provenance.
      }
      for (const j of exportJobs) {
        const key = (j.result as { key?: unknown } | null)?.key;
        if (typeof key === "string") set.add(key);
      }
      const list = [...set].filter((k) => k.startsWith(`users/${userId}/`));
      let n = 0;
      for (const key of list) {
        try {
          await storage.delete(key);
          result.filesDeleted += 1;
        } catch (err) {
          result.filesFailed += 1;
          console.error("[delete-account] failed to delete", key, err);
        }
        n += 1;
        if (n % 25 === 0) await report(`Deleted ${n} of ${list.length} files`, { done: n, total: list.length });
      }
      await report(`${result.filesDeleted} file${result.filesDeleted === 1 ? "" : "s"} deleted${result.filesFailed ? `, ${result.filesFailed} failed` : ""}`, { deleted: result.filesDeleted, failed: result.filesFailed });
      return list.length;
    });

    await ctx.step("account", "Deleting the account", async (report) => {
      result.items = await db.item.count({ where: { userId } });
      await db.user.delete({ where: { id: userId } });
      await report(`Account, ${result.items} item${result.items === 1 ? "" : "s"}, sessions and connections removed`, { items: result.items, files: keys });
    });

    await ctx.step("audit", "Recording the deletion", async (report) => {
      await audit({ userId: null, action: "account.deleted", entityType: "user", meta: { emailHash, items: result.items, filesDeleted: result.filesDeleted, filesFailed: result.filesFailed, listingsToEnd: result.listingsToEnd.length, requestedAt: ctx.payload.requestedAt ?? null } });
      await report("Audit entry written with a hashed email only");
    });

    return result;
  });
}
