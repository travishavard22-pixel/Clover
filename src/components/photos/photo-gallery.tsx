"use client";
/**
 * <PhotoGallery photos={PhotoDTO[]} itemId={string} editable?: boolean onChange?: (photos: PhotoDTO[]) => void />
 *
 * Stable contract used by other features (item detail, listing editor, publish hub):
 *   photos    PhotoDTO[] — the complete list from GET /api/items/[id]/photos (hidden edit sources
 *             included; the gallery shows `visiblePhotos(photos)`). An already-visible list also works.
 *   itemId    string     — needed for edits (reorder / transform / delete / add).
 *   editable  boolean    — when true the grid becomes the PhotoManager (drag reorder, rotate, crop,
 *             enhance, replace, delete, add) and `onChange` receives the updated complete list.
 *   onChange  (photos: PhotoDTO[]) => void — required for edits to be reflected by the parent.
 *
 * Photo-first: the cover is large, the rest tile beside it. Tapping any photo opens <ImageViewer>.
 */
import { useState } from "react";
import { Images } from "lucide-react";
import { EmptyState } from "@/components/ui/card";
import type { PhotoDTO } from "@/lib/items/dto";
import { visiblePhotos } from "@/lib/photos/order";
import { cn } from "@/lib/utils/cn";
import { ImageViewer } from "./image-viewer";
import { CoverBadge, PhotoBadge } from "./photo-badge";
import { PhotoManager } from "./photo-manager";

export function PhotoGallery({ photos, itemId, editable = false, onChange, className }: { photos: PhotoDTO[]; itemId: string; editable?: boolean; onChange?: (photos: PhotoDTO[]) => void; className?: string }) {
  const [viewer, setViewer] = useState<{ open: boolean; index: number }>({ open: false, index: 0 });
  const visible = visiblePhotos(photos);
  const open = (index: number) => setViewer({ open: true, index });

  if (visible.length === 0 && !editable) {
    return <EmptyState title="No photos yet" description="Add photos to see them here." icon={<Images className="size-6" strokeWidth={1.5} />} serif={false} className={className} />;
  }

  return (
    <div className={className}>
      {editable ? (
        <PhotoManager itemId={itemId} photos={photos} onChange={onChange ?? (() => undefined)} onOpen={open} />
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:gap-3 md:grid-cols-4" aria-label={`${visible.length} ${visible.length === 1 ? "photo" : "photos"}`}>
          {visible.map((p, i) => (
            <li key={p.id} className={cn("list-none", i === 0 && "col-span-2 row-span-2")}>
              <button
                type="button"
                onClick={() => open(i)}
                aria-label={`Open photo ${i + 1}${p.label ? `, ${p.label}` : ""}${i === 0 ? " (cover)" : ""}`}
                className="group relative block aspect-square w-full overflow-hidden rounded-sm border border-border-subtle bg-surface-sunken"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- signed same-origin URL */}
                <img src={i === 0 ? p.url : p.thumbUrl} alt={p.label ? `Photo ${i + 1}: ${p.label}` : `Photo ${i + 1}`} width={p.width} height={p.height} loading={i > 5 ? "lazy" : undefined} className="size-full object-cover transition-transform duration-(--dur-base) ease-(--ease-out) group-hover:scale-[1.02]" />
                <span className="pointer-events-none absolute left-2 top-2 flex gap-1.5">
                  {i === 0 && <CoverBadge />}
                  <PhotoBadge photo={p} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <ImageViewer photos={photos} index={viewer.index} open={viewer.open} onClose={() => setViewer((v) => ({ ...v, open: false }))} onIndexChange={(index) => setViewer({ open: true, index })} />
    </div>
  );
}
