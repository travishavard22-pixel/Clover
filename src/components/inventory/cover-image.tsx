import { ImageOff } from "lucide-react";
import type { CoverPhoto } from "@/lib/inventory/types";
import { cn } from "@/lib/utils/cn";

/**
 * The item's cover photo. Signed same-origin URLs, so a plain <img> (next/image's remote patterns are
 * locked down). Falls back to a quiet placeholder — never a broken-image icon.
 */
export function CoverImage({ cover, alt, className, sizes = "thumb", muted }: { cover: CoverPhoto | null; alt: string; className?: string; sizes?: "thumb" | "web"; muted?: boolean }) {
  if (!cover) {
    return (
      <div className={cn("flex items-center justify-center bg-surface-sunken text-muted", className)} role="img" aria-label={`${alt} — no photo yet`}>
        <ImageOff className="size-5" strokeWidth={1.5} aria-hidden />
      </div>
    );
  }
  return (
    <img
      src={sizes === "web" ? cover.url : cover.thumbUrl}
      alt={alt}
      width={cover.width}
      height={cover.height}
      loading="lazy"
      decoding="async"
      className={cn("h-full w-full object-cover", muted && "saturate-[0.35] opacity-80", className)}
    />
  );
}
