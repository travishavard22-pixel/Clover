import { Badge } from "@/components/ui/badge";
import type { ItemStatus } from "@/lib/db";
import { ITEM_STATUS_META } from "@/lib/items/status";

/** Item status as a badge. Colour is duplicated by the text so it never carries meaning alone. */
export function ItemStatusBadge({ status, className }: { status: ItemStatus; className?: string }) {
  const meta = ITEM_STATUS_META[status];
  return (
    <Badge tone={meta.tone} className={className} title={meta.description}>
      {meta.label}
    </Badge>
  );
}
