import { Skeleton } from "@/components/ui/card";
import type { Density } from "./use-density";

/** Layout-matched skeletons so the page never jumps when data lands. */
export function InventorySkeleton({ density = "comfortable", count = 12 }: { density?: Density; count?: number }) {
  if (density === "compact") {
    return (
      <div className="surface-card overflow-hidden" aria-busy aria-label="Loading items">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-border-subtle px-3 py-2 last:border-b-0">
            <Skeleton className="size-5 rounded-[5px]" />
            <Skeleton className="size-10 rounded-[6px]" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-4 w-14" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5" aria-busy aria-label="Loading items">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-sm border border-border-subtle bg-surface-raised">
          <Skeleton className="aspect-square w-full rounded-none" />
          <div className="space-y-2 p-3">
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-2/3" />
            <div className="flex justify-between pt-1">
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-5 w-12" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
