import { Page } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/card";

export default function Loading() {
  return (
    <Page>
      <div className="py-8">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-3 h-8 w-64" />
        <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="mb-6 h-28 w-full" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} className="h-56 w-full" />
        ))}
      </div>
    </Page>
  );
}
