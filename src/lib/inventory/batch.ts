import { z } from "zod";
import { db, type ItemStatus } from "../db";
import { ApiError } from "../api";
import { audit } from "../audit";
import { canTransition } from "../items/status";
import { applyReprice } from "./compute";
import { itemsToCsv } from "./csv";
import { deleteOrArchive, statusSideEffects, unarchiveTarget } from "./rules";

const ids = z.array(z.string().min(1).max(64)).min(1).max(200);

export const BatchSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("set_status"), ids, params: z.object({ status: z.enum(["DRAFT", "READY", "LISTED", "ARCHIVED"]) }) }),
  z.object({ op: z.literal("archive"), ids, params: z.object({}).optional() }),
  z.object({ op: z.literal("unarchive"), ids, params: z.object({}).optional() }),
  z.object({ op: z.literal("delete"), ids, params: z.object({}).optional() }),
  z.object({ op: z.literal("set_storage"), ids, params: z.object({ storageLocation: z.string().trim().max(120).nullable() }) }),
  z.object({
    op: z.literal("reprice"),
    ids,
    params: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("absolute"), cents: z.number().int().min(100).max(100_000_000) }),
      z.object({ mode: z.literal("percent"), percent: z.number().min(-90).max(500), round: z.boolean().optional() }),
    ]),
  }),
  z.object({ op: z.literal("export_csv"), ids, params: z.object({}).optional() }),
]);
export type BatchInput = z.infer<typeof BatchSchema>;

export type BatchOutcome = { id: string; ok: boolean; reason?: string; before?: unknown; after?: unknown };
export type BatchResult = { op: BatchInput["op"]; results: BatchOutcome[]; applied: number; skipped: number; csv?: string };

type Meta = { ip?: string | null; userAgent?: string | null };

export async function runBatch(userId: string, input: BatchInput, meta: Meta = {}): Promise<BatchResult> {
  const items = await db.item.findMany({ where: { userId, id: { in: input.ids } } });
  const found = new Map(items.map((i) => [i.id, i]));
  const results: BatchOutcome[] = [];
  for (const id of input.ids) if (!found.has(id)) results.push({ id, ok: false, reason: "Item not found" });
  if (items.length === 0) throw new ApiError(404, "None of those items were found", "not_found");

  let csv: string | undefined;
  switch (input.op) {
    case "set_status": {
      const to = input.params.status as ItemStatus;
      for (const item of items) {
        if (!canTransition(item.status, to)) {
          results.push({ id: item.id, ok: false, reason: `Can't move from ${item.status} to ${to}`, before: item.status });
          continue;
        }
        if (item.status !== to) await db.item.update({ where: { id: item.id }, data: { status: to, ...statusSideEffects(item.status, to) } });
        results.push({ id: item.id, ok: true, before: item.status, after: to });
      }
      break;
    }
    case "archive": {
      for (const item of items) {
        if (item.status === "ARCHIVED") {
          results.push({ id: item.id, ok: true, before: "ARCHIVED", after: "ARCHIVED" });
          continue;
        }
        if (!canTransition(item.status, "ARCHIVED")) {
          results.push({ id: item.id, ok: false, reason: `Can't archive a ${item.status.toLowerCase()} item`, before: item.status });
          continue;
        }
        await db.item.update({ where: { id: item.id }, data: { status: "ARCHIVED", archivedAt: new Date() } });
        results.push({ id: item.id, ok: true, before: item.status, after: "ARCHIVED" });
      }
      break;
    }
    case "unarchive": {
      for (const item of items) {
        if (item.status !== "ARCHIVED") {
          results.push({ id: item.id, ok: true, before: item.status, after: item.status });
          continue;
        }
        const to: ItemStatus = unarchiveTarget(item);
        await db.item.update({ where: { id: item.id }, data: { status: to, archivedAt: null } });
        results.push({ id: item.id, ok: true, before: "ARCHIVED", after: to });
      }
      break;
    }
    case "delete": {
      const toDelete = items.filter((i) => deleteOrArchive(i.status) === "delete");
      const toArchive = items.filter((i) => deleteOrArchive(i.status) === "archive");
      if (toDelete.length) {
        const photos = await db.photo.findMany({ where: { itemId: { in: toDelete.map((i) => i.id) } }, select: { storageKey: true, thumbKey: true } });
        await db.item.deleteMany({ where: { userId, id: { in: toDelete.map((i) => i.id) } } });
        const { storage } = await import("../storage");
        await Promise.allSettled(photos.flatMap((p) => [storage.delete(p.storageKey), ...(p.thumbKey ? [storage.delete(p.thumbKey)] : [])]));
        for (const i of toDelete) results.push({ id: i.id, ok: true, before: i.status, after: "deleted" });
      }
      for (const i of toArchive) {
        await db.item.update({ where: { id: i.id }, data: { status: "ARCHIVED", archivedAt: new Date() } });
        results.push({ id: i.id, ok: true, before: i.status, after: "ARCHIVED", reason: "Archived instead of deleted to keep its sales history" });
      }
      break;
    }
    case "set_storage": {
      await db.item.updateMany({ where: { userId, id: { in: items.map((i) => i.id) } }, data: { storageLocation: input.params.storageLocation } });
      for (const i of items) results.push({ id: i.id, ok: true, before: i.storageLocation, after: input.params.storageLocation });
      break;
    }
    case "reprice": {
      for (const item of items) {
        const next = applyReprice(item.listPrice, item.floorPrice, input.params);
        if (next === null) {
          results.push({ id: item.id, ok: false, reason: "No list price to adjust", before: null });
          continue;
        }
        if (next !== item.listPrice) await db.item.update({ where: { id: item.id }, data: { listPrice: next } });
        results.push({ id: item.id, ok: true, before: item.listPrice, after: next });
      }
      break;
    }
    case "export_csv": {
      csv = itemsToCsv(items);
      for (const i of items) results.push({ id: i.id, ok: true });
      break;
    }
  }
  const applied = results.filter((r) => r.ok).length;
  await audit({ userId, action: "items.batch", entityType: "item", meta: { op: input.op, count: input.ids.length, applied, params: input.params ?? null }, ...meta });
  return { op: input.op, results, applied, skipped: results.length - applied, csv };
}
