import type { Photo } from "../db";
import { signedFileUrl } from "../storage";

/** Client-safe photo representation with time-limited URLs. */
export type PhotoDTO = {
  id: string;
  kind: Photo["kind"];
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
  sortOrder: number;
  aiGenerated: boolean;
  studioMode: Photo["studioMode"];
  sourcePhotoId: string | null;
  label: string | null;
  createdAt: string;
};

export function toPhotoDTO(p: Photo, expiresInSeconds = 60 * 60 * 6): PhotoDTO {
  return {
    id: p.id,
    kind: p.kind,
    url: signedFileUrl(p.storageKey, expiresInSeconds, false),
    thumbUrl: signedFileUrl(p.thumbKey ?? p.storageKey, expiresInSeconds, false),
    width: p.width,
    height: p.height,
    sortOrder: p.sortOrder,
    aiGenerated: p.aiGenerated,
    studioMode: p.studioMode,
    sourcePhotoId: p.sourcePhotoId,
    label: p.label,
    createdAt: p.createdAt.toISOString(),
  };
}
