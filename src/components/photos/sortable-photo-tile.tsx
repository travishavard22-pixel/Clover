"use client";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { PhotoDTO } from "@/lib/items/dto";
import { cn } from "@/lib/utils/cn";
import { CoverBadge, PhotoBadge } from "./photo-badge";
import { PhotoActionsMenu, type PhotoAction } from "./photo-actions-menu";

export type PhotoTileProps = {
  photo: PhotoDTO;
  index: number;
  count: number;
  /** Status line while a transform is in flight ("Rotating…"). Disables actions. */
  busy?: string | null;
  onAction: (action: PhotoAction) => void;
  onOpen?: () => void;
  disabled?: boolean;
};

/** The static face of a tile, shared by the grid and the drag overlay. */
export function PhotoTileFace({ photo, index, busy, ghost }: { photo: PhotoDTO; index: number; busy?: string | null; ghost?: boolean }) {
  return (
    <div className={cn("relative aspect-square w-full overflow-hidden rounded-sm border border-border-subtle bg-surface-sunken", ghost && "shadow-float")}>
      {/* eslint-disable-next-line @next/next/no-img-element -- signed same-origin URL */}
      <img src={photo.thumbUrl} alt={photo.label ? `Photo ${index + 1}: ${photo.label}` : `Photo ${index + 1}`} width={photo.width} height={photo.height} className={cn("size-full object-cover transition-opacity", busy && "opacity-60")} draggable={false} />
      <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-1.5">
        {index === 0 ? <CoverBadge /> : <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-scrim px-1.5 text-xs font-medium tabular text-white">{index + 1}</span>}
      </div>
      {(photo.label || photo.kind !== "ORIGINAL" || photo.aiGenerated) && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-linear-to-t from-[var(--scrim-strong)] to-transparent p-2 pt-6">
          {photo.label ? <span className="truncate text-xs font-medium text-white scrim-text">{photo.label}</span> : <span />}
          <PhotoBadge photo={photo} className="shrink-0" />
        </div>
      )}
      {busy && (
        <div className="absolute inset-0 flex items-center justify-center bg-scrim" role="status">
          <span className="rounded-full bg-surface-overlay px-3 py-1 text-xs font-medium text-primary shadow-float">{busy}</span>
        </div>
      )}
    </div>
  );
}

export function SortablePhotoTile({ photo, index, count, busy, onAction, onOpen, disabled }: PhotoTileProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: photo.id, disabled: disabled || !!busy });
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition };
  return (
    <li ref={setNodeRef} style={style} className={cn("group relative list-none outline-none", isDragging && "z-10 opacity-40")} {...(onOpen ? {} : listeners)}>
      {onOpen ? (
        <button type="button" onClick={onOpen} disabled={!!busy} aria-label={`Open photo ${index + 1}${photo.label ? `, ${photo.label}` : ""}`} className="block w-full rounded-sm text-left" {...listeners}>
          <PhotoTileFace photo={photo} index={index} busy={busy} />
        </button>
      ) : (
        <PhotoTileFace photo={photo} index={index} busy={busy} />
      )}
      <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity duration-(--dur-fast) group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
        <PhotoActionsMenu photo={photo} index={index} count={count} disabled={disabled || !!busy} onAction={onAction} />
      </div>
      <button
        ref={setActivatorNodeRef}
        type="button"
        disabled={disabled || !!busy}
        aria-label={`Reorder photo ${index + 1} of ${count}. Press space to pick up, arrow keys to move, space to drop.`}
        className="absolute bottom-2 right-2 flex size-9 cursor-grab touch-none items-center justify-center rounded-full bg-scrim text-white opacity-0 backdrop-blur-sm transition-opacity duration-(--dur-fast) group-focus-within:opacity-100 group-hover:opacity-100 active:cursor-grabbing disabled:opacity-0 [@media(hover:none)]:opacity-100"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" aria-hidden />
      </button>
    </li>
  );
}
