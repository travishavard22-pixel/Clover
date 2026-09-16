import { Page } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/card";

export default function PublishLoading() {
  return (
    <Page>
      <div className="py-6 md:py-8">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-3 h-8 w-32" />
        <Skeleton className="mt-3 h-4 w-80 max-w-full" />
      </div>
      <Skeleton className="h-24 w-full rounded-sm" />
      <div className="mt-6 space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-40 w-full rounded-sm" />
        ))}
      </div>
    </Page>
  );
}
