import type { Evaluator, PhotoQualityConfig, Proposal, SnapshotItem, SnapshotPhoto } from "../types";
import { itemHref, plural } from "./shared";

export type PhotoIssue = { code: "too_few" | "low_resolution" | "no_studio" | "cover_original"; message: string };

/** Pure heuristics over the photo set. Exported for tests. */
export function photoIssues(item: SnapshotItem, config: PhotoQualityConfig): PhotoIssue[] {
  const photos = [...item.photos].sort((a, b) => a.sortOrder - b.sortOrder);
  const issues: PhotoIssue[] = [];
  if (photos.length < config.minPhotos) {
    issues.push({ code: "too_few", message: photos.length === 0 ? "No photos yet" : `Only ${plural(photos.length, "photo")} — buyers expect at least ${config.minPhotos}` });
  }
  const small = photos.filter((p) => Math.min(p.width, p.height) < config.minEdgePx);
  if (small.length) issues.push({ code: "low_resolution", message: `${plural(small.length, "photo is", "photos are")} under ${config.minEdgePx}px on the short edge` });
  if (config.requireStudioCover && photos.length > 0) {
    const styled = (p: SnapshotPhoto) => p.kind === "STUDIO" || p.kind === "ENHANCED";
    const cover = photos[0]!;
    if (!photos.some(styled)) issues.push({ code: "no_studio", message: "No studio or enhanced photo — a clean background lifts click-through" });
    else if (!styled(cover)) issues.push({ code: "cover_original", message: "The cover is an unedited original while a cleaner version exists" });
  }
  return issues;
}

/** Short, action-shaped headlines. The item is named separately in the row, so the title need not repeat it. */
const HEADLINES: Record<PhotoIssue["code"], string> = {
  too_few: "Add more photos",
  low_resolution: "Some photos are too small",
  no_studio: "No studio photo yet",
  cover_original: "Use the cleaner photo as the cover",
};

export const evaluatePhotoQuality: Evaluator<"PHOTO_QUALITY"> = (ctx, config: PhotoQualityConfig): Proposal[] => {
  const out: Proposal[] = [];
  for (const item of ctx.items) {
    if (item.status !== "READY" && item.status !== "LISTED") continue;
    const issues = photoIssues(item, config);
    if (!issues.length) continue;
    out.push({
      type: "PHOTO_QUALITY",
      itemId: item.id,
      title: issues.length === 1 ? HEADLINES[issues[0]!.code] : `${issues.length} photo issues`,
      body: issues.map((i) => i.message).join(". ") + ".",
      proposal: { key: `photo:${item.id}:${issues.map((i) => i.code).sort().join(",")}`, action: "review", itemId: item.id, href: itemHref(item.id, "photos"), checklist: issues.map((i) => i.message) },
      autoExecutable: false,
      autoBlockedReason: "Clover never changes your photos on its own.",
      notifyPreference: null,
    });
  }
  return out;
};
