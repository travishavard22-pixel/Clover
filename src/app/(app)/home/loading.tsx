import { Page } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/card";

export default function HomeLoading() {
  return (
    <Page>
      <div className="py-6 md:py-8">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-3 h-8 w-64" />
        <Skeleton className="mt-3 h-4 w-80" />
      </div>
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          <div className="surface-card space-y-3 p-5">
            <Skeleton className="h-5 w-36" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-3 py-2">
                <Skeleton className="size-11 rounded-[8px]" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="surface-card space-y-2 p-4">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-7 w-16" />
                <Skeleton className="h-3 w-24" />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-6 lg:col-span-4">
          <Skeleton className="h-36 w-full rounded-sm" />
          <Skeleton className="h-48 w-full rounded-sm" />
        </div>
      </div>
    </Page>
  );
}
