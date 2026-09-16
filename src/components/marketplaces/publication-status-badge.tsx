import { Badge } from "@/components/ui/badge";
import type { PublicationStatus } from "@/lib/db";
import { PUBLICATION_STATUS_META } from "@/lib/marketplaces/labels";
import { cn } from "@/lib/utils/cn";

export function PublicationStatusBadge({ status, className, live }: { status: PublicationStatus; className?: string; live?: boolean }) {
  const meta = PUBLICATION_STATUS_META[status];
  return (
    <Badge tone={meta.tone} className={cn(className)} title={meta.description}>
      {status === "PUBLISHING" && live && <span className="size-1.5 animate-pulse rounded-full bg-current" aria-hidden />}
      {meta.label}
    </Badge>
  );
}
