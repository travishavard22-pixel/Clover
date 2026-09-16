import { InventorySkeleton } from "@/components/inventory/inventory-skeleton";
import { Skeleton } from "@/components/ui/card";
import { Page } from "@/components/layout/page-header";

export default function InventoryLoading() {
  return (
    <Page width="wide">
      <div className="py-6 md:py-8">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-3 h-4 w-64" />
      </div>
      <div className="mb-4 flex gap-2">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="hidden h-10 w-40 md:block" />
        <Skeleton className="hidden h-10 w-40 md:block" />
      </div>
      <InventorySkeleton />
    </Page>
  );
}
