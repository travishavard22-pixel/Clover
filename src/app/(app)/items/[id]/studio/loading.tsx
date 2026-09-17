import { Skeleton } from "@/components/ui/card";
import { Page } from "@/components/layout/page-header";

/** Layout-matched skeleton for the studio while the gallery loads. */
export default function StudioLoading() {
  return (
    <Page width="wide" aria-busy>
      <div className="py-6 md:py-8">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-3 h-8 w-64" />
        <Skeleton className="mt-3 h-4 w-80 max-w-full" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-4">
          <Skeleton className="aspect-[4/3] w-full rounded-lg lg:aspect-auto lg:h-[min(62dvh,760px)]" />
          <div className="flex gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="size-20" />
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-2 lg:grid-cols-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[4/3] w-full" />
            ))}
          </div>
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    </Page>
  );
}
