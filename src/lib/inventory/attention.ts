import { db } from "../db";
import { MARKETPLACES } from "../marketplaces/registry";
import { formatMoney } from "../money";
import { daysBetween } from "./compute";
import { toCover } from "./query";
import type { AttentionRow } from "./types";

const STALE_AFTER_DAYS = 14;

const coverSelect = { photos: { orderBy: { sortOrder: "asc" as const }, take: 1, select: { id: true, storageKey: true, thumbKey: true, width: true, height: true, aiGenerated: true } } };

/**
 * The unified "needs me now" feed: pending offers, publications needing action, open
 * recommendations, stale listings, drafts and broken connections. Sorted by urgency, then recency.
 */
export async function getAttention(userId: string, opts: { limit?: number; now?: Date } = {}): Promise<AttentionRow[]> {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? 30;
  const staleBefore = new Date(now.getTime() - STALE_AFTER_DAYS * 86_400_000);

  const [offers, publications, recommendations, stale, drafts, connections] = await Promise.all([
    db.offer.findMany({
      where: { userId, status: "PENDING", item: { status: { notIn: ["SOLD", "SHIPPED", "COMPLETED", "ARCHIVED"] } } },
      orderBy: { receivedAt: "desc" },
      take: 20,
      include: { item: { select: { id: true, title: true, listPrice: true, ...coverSelect } } },
    }),
    db.publication.findMany({
      where: { userId, status: { in: ["NEEDS_ATTENTION", "REQUIRES_USER_ACTION", "FAILED"] } },
      orderBy: { updatedAt: "desc" },
      take: 20,
      include: { item: { select: { id: true, title: true, ...coverSelect } } },
    }),
    db.recommendation.findMany({
      where: { userId, status: "OPEN", OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }] },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { item: { select: { id: true, title: true, ...coverSelect } } },
    }),
    db.item.findMany({
      where: { userId, status: "LISTED", listedAt: { lte: staleBefore }, offers: { none: {} } },
      orderBy: { listedAt: "asc" },
      take: 20,
      select: { id: true, title: true, listPrice: true, listedAt: true, ...coverSelect },
    }),
    db.item.findMany({ where: { userId, status: { in: ["DRAFT", "READY"] } }, orderBy: { updatedAt: "desc" }, take: 10, select: { id: true, title: true, status: true, updatedAt: true, ...coverSelect } }),
    db.marketplaceConnection.findMany({ where: { userId, status: { in: ["ERROR", "NEEDS_REAUTH"] } }, select: { id: true, marketplace: true, status: true, lastError: true, updatedAt: true } }),
  ]);

  const rows: AttentionRow[] = [];
  for (const o of offers) {
    const m = MARKETPLACES[o.marketplace];
    rows.push({
      id: `offer:${o.id}`,
      kind: "offer",
      severity: 1,
      title: `${formatMoney(o.amount)} offer from ${o.buyerName}`,
      body: `${o.item.title} · asking ${formatMoney(o.originalPrice)} on ${m.name}${o.expiresAt ? ` · expires ${relative(o.expiresAt, now)}` : ""}`,
      href: `/offers?offer=${o.id}`,
      actionLabel: "Respond",
      itemId: o.item.id,
      itemTitle: o.item.title,
      cover: toCover(o.item.photos[0]),
      marketplace: o.marketplace,
      amount: o.amount,
      at: o.receivedAt.toISOString(),
      actions: [],
    });
  }
  for (const p of publications) {
    const m = MARKETPLACES[p.marketplace];
    const attention = (p.attention ?? null) as { code?: string; message?: string; recovery?: string } | null;
    const isGuard = attention?.code === "double_sell_guard";
    rows.push({
      id: `publication:${p.id}`,
      kind: "publication",
      severity: isGuard || p.status === "FAILED" ? 1 : 2,
      title: attention?.message ?? (p.status === "FAILED" ? `Publishing to ${m.name} failed` : p.status === "REQUIRES_USER_ACTION" ? `Finish posting on ${m.name}` : `${m.name} listing needs attention`),
      body: `${p.item.title}${attention?.recovery ? ` · ${attention.recovery}` : p.lastError ? ` · ${p.lastError}` : ""}`,
      href: `/listings?item=${p.item.id}&marketplace=${p.marketplace}`,
      actionLabel: isGuard ? "End listing" : p.status === "FAILED" ? "Retry" : "Fix",
      itemId: p.item.id,
      itemTitle: p.item.title,
      cover: toCover(p.item.photos[0]),
      marketplace: p.marketplace,
      amount: null,
      at: p.updatedAt.toISOString(),
      actions: [],
    });
  }
  for (const r of recommendations) {
    rows.push({
      id: `recommendation:${r.id}`,
      kind: "recommendation",
      severity: 2,
      title: r.title,
      body: r.body,
      href: `/automations?recommendation=${r.id}`,
      actionLabel: "Review",
      itemId: r.item?.id ?? null,
      itemTitle: r.item?.title ?? null,
      cover: r.item ? toCover(r.item.photos[0]) : null,
      marketplace: null,
      amount: null,
      at: r.createdAt.toISOString(),
      actions: [
        { key: "apply", label: "Apply", method: "POST", href: `/api/recommendations/${r.id}/apply` },
        { key: "snooze", label: "Snooze", method: "POST", href: `/api/recommendations/${r.id}/snooze`, body: { days: 3 } },
        { key: "dismiss", label: "Dismiss", method: "POST", href: `/api/recommendations/${r.id}/dismiss` },
      ],
    });
  }
  const recommendedItemIds = new Set(recommendations.map((r) => r.itemId).filter(Boolean));
  for (const s of stale) {
    if (recommendedItemIds.has(s.id)) continue; // the recommendation already covers it
    const days = s.listedAt ? daysBetween(s.listedAt, now) : 0;
    rows.push({
      id: `stale:${s.id}`,
      kind: "stale",
      severity: 3,
      title: `${days} days listed, no offers`,
      body: `${s.title}${s.listPrice !== null ? ` at ${formatMoney(s.listPrice)}` : ""} — consider a lower price or fresh photos.`,
      href: `/items/${s.id}`,
      actionLabel: "Reprice",
      itemId: s.id,
      itemTitle: s.title,
      cover: toCover(s.photos[0]),
      marketplace: null,
      amount: s.listPrice,
      at: s.listedAt?.toISOString() ?? now.toISOString(),
      actions: [],
    });
  }
  for (const d of drafts) {
    rows.push({
      id: `draft:${d.id}`,
      kind: "draft",
      severity: 3,
      title: d.status === "READY" ? "Ready to publish" : "Unfinished draft",
      body: d.title,
      href: d.status === "READY" ? `/items/${d.id}` : `/sell/review/${d.id}`,
      actionLabel: d.status === "READY" ? "Publish" : "Finish",
      itemId: d.id,
      itemTitle: d.title,
      cover: toCover(d.photos[0]),
      marketplace: null,
      amount: null,
      at: d.updatedAt.toISOString(),
      actions: [],
    });
  }
  for (const c of connections) {
    const m = MARKETPLACES[c.marketplace];
    rows.push({
      id: `connection:${c.id}`,
      kind: "connection",
      severity: 2,
      title: c.status === "NEEDS_REAUTH" ? `Reconnect ${m.name}` : `${m.name} connection error`,
      body: c.lastError ?? "Listings can't sync until this is fixed.",
      href: `/connections`,
      actionLabel: "Reconnect",
      itemId: null,
      itemTitle: null,
      cover: null,
      marketplace: c.marketplace,
      amount: null,
      at: c.updatedAt.toISOString(),
      actions: [],
    });
  }
  rows.sort((a, b) => a.severity - b.severity || b.at.localeCompare(a.at));
  return rows.slice(0, limit);
}

function relative(date: Date, now: Date): string {
  const diff = date.getTime() - now.getTime();
  const h = Math.round(diff / 3_600_000);
  if (Math.abs(h) < 1) return diff >= 0 ? "within the hour" : "just now";
  if (Math.abs(h) < 48) return diff >= 0 ? `in ${h}h` : `${-h}h ago`;
  const d = Math.round(h / 24);
  return diff >= 0 ? `in ${d}d` : `${-d}d ago`;
}
