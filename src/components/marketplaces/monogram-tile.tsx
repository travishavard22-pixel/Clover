import { monogram } from "@/lib/marketplaces/labels";
import { cn } from "@/lib/utils/cn";

const sizes = { sm: "size-7 text-[11px] rounded-[6px]", md: "size-10 text-sm rounded-xs", lg: "size-12 text-base rounded-sm" };

/**
 * Marketplace identity without third-party logos: one or two letters on the marketplace's colour
 * from the registry. The full name is always in the accessible label.
 */
export function MonogramTile({ shortName, name, color, size = "md", className }: { shortName: string; name: string; color: string; size?: keyof typeof sizes; className?: string }) {
  return (
    <span role="img" aria-label={name} className={cn("inline-flex shrink-0 select-none items-center justify-center font-semibold text-white shadow-[inset_0_0_0_1px_oklch(0_0_0/0.08)]", sizes[size], className)} style={{ background: color }}>
      <span aria-hidden>{monogram(shortName)}</span>
    </span>
  );
}
