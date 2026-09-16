"use client";
import { ArrowLeft, ArrowRight, Crop, ImagePlus, MoreHorizontal, RotateCw, SlidersHorizontal, Star, Tag, Trash2, Undo2 } from "lucide-react";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import type { PhotoDTO } from "@/lib/items/dto";
import { cn } from "@/lib/utils/cn";

export type PhotoAction = "rotate" | "crop" | "enhance" | "useOriginal" | "makeCover" | "moveLeft" | "moveRight" | "replace" | "rename" | "delete";

/**
 * Per-photo actions. "Move left / right" and "Make cover" are the keyboard- and screen-reader-
 * friendly alternative to drag-and-drop, so they are always present.
 */
export function PhotoActionsMenu({ photo, index, count, disabled, onAction, className, triggerLabel }: { photo: PhotoDTO; index: number; count: number; disabled?: boolean; onAction: (action: PhotoAction) => void; className?: string; triggerLabel?: string }) {
  const edited = photo.kind === "ENHANCED" && !!photo.sourcePhotoId;
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={triggerLabel ?? `Actions for photo ${index + 1}`}
          className={cn("flex size-9 items-center justify-center rounded-full bg-scrim text-white backdrop-blur-sm transition-colors hover:bg-[var(--scrim-strong)] disabled:opacity-50", className)}
        >
          <MoreHorizontal className="size-4" aria-hidden />
        </button>
      </MenuTrigger>
      <MenuContent align="end" className="w-52">
        <MenuItem onSelect={() => onAction("rotate")}>
          <RotateCw className="size-4" aria-hidden /> Rotate 90°
        </MenuItem>
        <MenuItem onSelect={() => onAction("crop")}>
          <Crop className="size-4" aria-hidden /> Crop…
        </MenuItem>
        <MenuItem onSelect={() => onAction("enhance")}>
          <SlidersHorizontal className="size-4" aria-hidden /> Enhance
        </MenuItem>
        {edited && (
          <MenuItem onSelect={() => onAction("useOriginal")}>
            <Undo2 className="size-4" aria-hidden /> Use original
          </MenuItem>
        )}
        <MenuSeparator />
        {index > 0 && (
          <MenuItem onSelect={() => onAction("makeCover")}>
            <Star className="size-4" aria-hidden /> Make cover
          </MenuItem>
        )}
        <MenuItem disabled={index === 0} onSelect={() => onAction("moveLeft")}>
          <ArrowLeft className="size-4" aria-hidden /> Move left
        </MenuItem>
        <MenuItem disabled={index >= count - 1} onSelect={() => onAction("moveRight")}>
          <ArrowRight className="size-4" aria-hidden /> Move right
        </MenuItem>
        <MenuSeparator />
        <MenuItem onSelect={() => onAction("rename")}>
          <Tag className="size-4" aria-hidden /> {photo.label ? "Edit label…" : "Add label…"}
        </MenuItem>
        <MenuItem onSelect={() => onAction("replace")}>
          <ImagePlus className="size-4" aria-hidden /> Replace…
        </MenuItem>
        <MenuSeparator />
        <MenuItem destructive onSelect={() => onAction("delete")}>
          <Trash2 className="size-4" aria-hidden /> Delete
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
