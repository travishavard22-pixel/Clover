import JSZip from "jszip";
import type { registerJobHandler } from "../runner";
import { db } from "../../db";
import { audit } from "../../audit";
import { notify } from "../../notifications";
import { signedFileUrl, storage } from "../../storage";

type Payload = { userId: string };

export type ExportDataResult = {
  key: string;
  url: string;
  bytes: number;
  expiresAt: string;
  counts: { items: number; photos: number; photosMissing: number; offers: number; publications: number; threads: number };
};

export const EXPORT_STEPS = [
  { key: "collect", label: "Collecting your records" },
  { key: "photos", label: "Adding your photos" },
  { key: "zip", label: "Packing the archive" },
  { key: "store", label: "Saving the archive" },
  { key: "notify", label: "Sending you the link" },
];

export const EXPORT_LINK_TTL_SECONDS = 24 * 60 * 60;

function stamp(d: Date) {
  return d.toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function safeName(s: string) {
  return s.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "item";
}

function originalKeyOf(p: { storageKey: string; provenance: unknown }): string | null {
  const prov = p.provenance as { originalKey?: unknown } | null;
  return typeof prov?.originalKey === "string" && prov.originalKey !== p.storageKey ? prov.originalKey : null;
}

/**
 * EXPORT_DATA — payload `{ userId }`. Builds a ZIP with every record the seller owns as JSON plus
 * every stored photo, writes it under the seller's own storage prefix and notifies them with a
 * signed link that expires after 24 hours. Secrets (marketplace tokens, password hashes) are
 * never included.
 */
export function register(r: typeof registerJobHandler) {
  r<Payload, ExportDataResult>("EXPORT_DATA", async (ctx) => {
    const userId = ctx.payload.userId ?? ctx.job.userId;
    if (!userId) throw new Error("EXPORT_DATA needs a userId");
    const now = new Date();
    const zip = new JSZip();
    const counts: ExportDataResult["counts"] = { items: 0, photos: 0, photosMissing: 0, offers: 0, publications: 0, threads: 0 };

    const photoRows = await ctx.step("collect", "Collecting your records", async (report) => {
      const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, emailVerified: true, image: true, createdAt: true, updatedAt: true } });
      if (!user) throw new Error("User not found");
      const [preferences, items, connections, rules, recommendations, notifications, auditLogs, threads, jobs, accounts] = await Promise.all([
        db.userPreferences.findUnique({ where: { userId } }),
        db.item.findMany({
          where: { userId },
          orderBy: { createdAt: "asc" },
          include: {
            photos: { orderBy: { sortOrder: "asc" } },
            profile: true,
            comps: true,
            estimate: true,
            drafts: { include: { versions: { orderBy: { version: "asc" } } } },
            publications: true,
            offers: true,
            recommendations: true,
          },
        }),
        db.marketplaceConnection.findMany({ where: { userId }, select: { id: true, marketplace: true, status: true, mode: true, externalAccountId: true, externalAccountName: true, scopes: true, metadata: true, lastSyncAt: true, lastError: true, connectedAt: true, createdAt: true, updatedAt: true } }),
        db.automationRule.findMany({ where: { userId } }),
        db.recommendation.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
        db.notification.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
        db.auditLog.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, take: 5000 }),
        db.copilotThread.findMany({ where: { userId }, include: { messages: { orderBy: { createdAt: "asc" } } }, orderBy: { createdAt: "asc" } }),
        db.job.findMany({ where: { userId }, select: { id: true, type: true, status: true, itemId: true, steps: true, result: true, error: true, createdAt: true, finishedAt: true }, orderBy: { createdAt: "asc" }, take: 2000 }),
        db.account.findMany({ where: { userId }, select: { providerId: true, createdAt: true } }),
      ]);
      counts.items = items.length;
      counts.offers = items.reduce((n, i) => n + i.offers.length, 0);
      counts.publications = items.reduce((n, i) => n + i.publications.length, 0);
      counts.threads = threads.length;

      const put = (name: string, data: unknown) => zip.file(`data/${name}.json`, JSON.stringify(data, null, 2));
      put("user", { ...user, signInMethods: accounts.map((a) => a.providerId) });
      put("preferences", preferences);
      put("items", items.map((i) => ({ ...i, photos: i.photos.map((p) => ({ ...p, file: `photos/${safeName(i.sku)}/${p.id}-${p.kind.toLowerCase()}.jpg`, originalFile: originalKeyOf(p) ? `photos/${safeName(i.sku)}/${p.id}-original.jpg` : null })) })));
      put("marketplace-connections", connections);
      put("automation-rules", rules);
      put("recommendations", recommendations);
      put("notifications", notifications);
      put("audit-log", auditLogs);
      put("copilot-threads", threads);
      put("jobs", jobs);
      zip.file(
        "README.txt",
        [
          `Clover data export for ${user.email}`,
          `Created ${now.toISOString()}`,
          "",
          "data/        every record you own, as JSON (money is in integer cents)",
          "photos/      your photos, one folder per item SKU; -original files are the untouched uploads",
          "",
          "Marketplace tokens and password hashes are never exported.",
        ].join("\n"),
      );
      await report(`${items.length} items, ${counts.publications} listings, ${counts.offers} offers, ${threads.length} conversations`, { ...counts });
      return items.flatMap((i) => i.photos.map((p) => ({ ...p, sku: i.sku })));
    });

    await ctx.step("photos", "Adding your photos", async (report) => {
      let done = 0;
      for (const p of photoRows) {
        if (ctx.signal.aborted) throw new Error("Worker is shutting down");
        const folder = `photos/${safeName(p.sku)}`;
        const main = await storage.get(p.storageKey);
        if (main) {
          zip.file(`${folder}/${p.id}-${p.kind.toLowerCase()}.jpg`, main);
          counts.photos += 1;
        } else counts.photosMissing += 1;
        const origKey = originalKeyOf(p);
        if (origKey) {
          const orig = await storage.get(origKey);
          if (orig) {
            zip.file(`${folder}/${p.id}-original.jpg`, orig);
            counts.photos += 1;
          } else counts.photosMissing += 1;
        }
        done += 1;
        if (done % 10 === 0 || done === photoRows.length) await report(`Added ${done} of ${photoRows.length} photos`, { done, total: photoRows.length });
      }
      if (photoRows.length === 0) await report("No photos to add");
    });

    const bytes = await ctx.step("zip", "Packing the archive", async (report) => {
      const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
      await report(`${(buf.length / (1024 * 1024)).toFixed(1)} MB`, { bytes: buf.length });
      return buf;
    });

    const key = `users/${userId}/exports/${stamp(now)}.zip`;
    await ctx.step("store", "Saving the archive", async (report) => {
      await storage.put(key, bytes, { contentType: "application/zip", cacheControl: "private, no-store" });
      await report("Saved to your private storage", { key });
    });

    const url = signedFileUrl(key, EXPORT_LINK_TTL_SECONDS, false);
    const expiresAt = new Date(now.getTime() + EXPORT_LINK_TTL_SECONDS * 1000).toISOString();
    await ctx.step("notify", "Sending you the link", async (report) => {
      await notify(userId, { type: "data.export", title: "Your data export is ready", body: `${counts.items} items and ${counts.photos} photos. The download link works for 24 hours.`, href: url });
      await audit({ userId, action: "data.export", entityType: "export", entityId: key, meta: { bytes: bytes.length, ...counts } });
      await report("Notification sent; the link expires in 24 hours", { url, expiresAt });
    });

    return { key, url, bytes: bytes.length, expiresAt, counts };
  });
}
