import { Page } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/card";

export default function ConnectionsLoading() {
  return (
    <Page>
      <div className="py-6 md:py-8">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-44 w-full rounded-sm" />
        ))}
      </div>
    </Page>
  );
}
