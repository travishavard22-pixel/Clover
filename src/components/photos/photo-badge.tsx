import { Badge } from "@/components/ui/badge";
import type { PhotoDTO } from "@/lib/items/dto";

/**
 * Labels a photo honestly: AI-generated backgrounds, edits and condition shots are always marked.
 * Returns null for an untouched original so the grid stays quiet.
 */
export function photoKindLabel(photo: Pick<PhotoDTO, "kind" | "aiGenerated">): { label: string; tone: "info" | "neutral" | "warning" } | null {
  if (photo.aiGenerated) return { label: "AI background", tone: "info" };
  if (photo.kind === "STUDIO") return { label: "Studio", tone: "neutral" };
  if (photo.kind === "CONDITION") return { label: "Condition", tone: "warning" };
  if (photo.kind === "ENHANCED") return { label: "Edited", tone: "neutral" };
  return null;
}

export function PhotoBadge({ photo, className }: { photo: Pick<PhotoDTO, "kind" | "aiGenerated">; className?: string }) {
  const meta = photoKindLabel(photo);
  if (!meta) return null;
  return (
    <Badge tone={meta.tone} className={className}>
      {meta.label}
    </Badge>
  );
}

export function CoverBadge({ className }: { className?: string }) {
  return (
    <Badge tone="inverse" className={className}>
      Cover
    </Badge>
  );
}
