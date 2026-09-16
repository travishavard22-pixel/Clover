"use client";
import { useRef } from "react";
import { ImagePlus } from "lucide-react";
import { ACCEPT_ATTRIBUTE } from "@/lib/photos/mime";
import { cn } from "@/lib/utils/cn";

/** Grid slot that adds more photos. Reports the picked files; the manager uploads them. */
export function AddPhotosTile({ onFiles, remaining, progress, className }: { onFiles: (files: File[]) => void; remaining: number; progress?: { done: number; total: number } | null; className?: string }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const full = remaining <= 0;
  return (
    <li className={cn("list-none", className)}>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
      <button
        type="button"
        disabled={full || !!progress}
        onClick={() => inputRef.current?.click()}
        aria-label={full ? "Photo limit reached" : `Add photos (${remaining} more allowed)`}
        className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-sm border border-dashed border-border-default bg-surface-raised text-secondary transition-colors hover:border-border-strong hover:text-primary disabled:opacity-60"
      >
        <ImagePlus className="size-6" strokeWidth={1.5} aria-hidden />
        {progress ? (
          <span className="text-xs tabular" aria-live="polite">
            Saving {Math.min(progress.done + 1, progress.total)} of {progress.total}
          </span>
        ) : (
          <span className="text-xs font-medium">{full ? "Limit reached" : "Add photos"}</span>
        )}
      </button>
    </li>
  );
}
