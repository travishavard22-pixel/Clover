import { Page } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/card";

export default function ListingsLoading() {
  return (
    <Page width="wide">
      <div className="py-6 md:py-8">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="mt-3 h-4 w-72 max-w-full" />
      </div>
      <div className="mb-4 flex gap-2">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="hidden h-10 w-40 md:block" />
        <Skeleton className="hidden h-10 w-40 md:block" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[4/5] w-full rounded-sm" />
        ))}
      </div>
    </Page>
  );
}
