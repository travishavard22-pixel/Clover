import type { Photo } from "../db";

/**
 * Chooses and orders the photos that go to a marketplace. Rules (from the brand and honesty
 * contract): the seller's real photos lead; an enhanced version replaces its original when one
 * exists; studio renders follow; AI-stylised backgrounds never take the cover slot; condition
 * close-ups go last so defects are visible but not the first impression.
 */
export function selectListingPhotos(photos: Photo[], max: number): Photo[] {
  const byId = new Map(photos.map((p) => [p.id, p]));
  const enhancedFor = new Map<string, Photo>();
  for (const p of photos) if (p.kind === "ENHANCED" && p.sourcePhotoId && byId.has(p.sourcePhotoId)) enhancedFor.set(p.sourcePhotoId, p);

  const originals = photos.filter((p) => p.kind === "ORIGINAL").sort((a, b) => a.sortOrder - b.sortOrder);
  const lead = originals.map((o) => enhancedFor.get(o.id) ?? o);
  const studioReal = photos.filter((p) => p.kind === "STUDIO" && !p.aiGenerated).sort((a, b) => a.sortOrder - b.sortOrder);
  const studioAi = photos.filter((p) => p.kind === "STUDIO" && p.aiGenerated).sort((a, b) => a.sortOrder - b.sortOrder);
  const condition = photos.filter((p) => p.kind === "CONDITION").sort((a, b) => a.sortOrder - b.sortOrder);
  const orphanEnhanced = photos.filter((p) => p.kind === "ENHANCED" && !(p.sourcePhotoId && byId.has(p.sourcePhotoId)));

  const ordered = [...lead, ...orphanEnhanced, ...studioReal, ...studioAi, ...condition];
  const seen = new Set<string>();
  const out: Photo[] = [];
  for (const p of ordered) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
    if (out.length >= max) break;
  }
  // Never let an AI-generated image lead a listing: swap it with the first real photo.
  if (out.length > 1 && out[0]!.aiGenerated) {
    const idx = out.findIndex((p) => !p.aiGenerated);
    if (idx > 0) [out[0], out[idx]] = [out[idx]!, out[0]!];
  }
  return out;
}

export function photoPackFilename(index: number, total: number): string {
  const n = String(index + 1).padStart(Math.max(2, String(total).length), "0");
  return index === 0 ? `${n}-cover.jpg` : `${n}.jpg`;
}
