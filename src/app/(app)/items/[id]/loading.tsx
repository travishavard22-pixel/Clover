import { Skeleton } from "@/components/ui/card";

/** Layout-matched skeleton for the review workspace. */
export default function ItemLoading() {
  return (
    <div className="mx-auto w-full max-w-[1440px] gutter pb-12" aria-busy aria-label="Loading item">
      <div className="py-5 md:py-7">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-3 h-8 w-72 max-w-full" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <div className="surface-card p-5">
            <Skeleton className="h-4 w-24" />
            <div className="mt-4 grid grid-cols-3 gap-2 md:grid-cols-4">
              <Skeleton className="col-span-2 row-span-2 aspect-square" />
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square" />
              ))}
            </div>
          </div>
          <div className="surface-card p-5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-4 h-8 w-80 max-w-full" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
              ))}
            </div>
          </div>
          <div className="surface-card p-5">
            <Skeleton className="h-4 w-24" />
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
            <Skeleton className="mt-4 h-2 w-full rounded-full" />
          </div>
          <div className="surface-card p-5">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="mt-4 h-10 w-full" />
            <Skeleton className="mt-3 h-40 w-full" />
          </div>
        </div>
        <div className="hidden lg:block">
          <div className="surface-card space-y-4 p-5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-12 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
