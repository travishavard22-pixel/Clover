import { Page } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/card";

export default function OffersLoading() {
  return (
    <Page>
      <div className="py-6 md:py-8">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="mt-3 h-4 w-64" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-36 w-full rounded-sm" />
        ))}
      </div>
    </Page>
  );
}
