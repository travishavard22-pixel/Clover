import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CoverImage } from "@/components/inventory/cover-image";
import { ItemStatusBadge } from "@/components/inventory/status-badge";
import { Money } from "@/components/ui/money";
import { isSoldStatus } from "@/lib/inventory/compute";
import type { ItemListDTO } from "@/lib/inventory/types";

/** A horizontal photo row of the newest items — the photos are the colour of the page. */
export function RecentItems({ items }: { items: ItemListDTO[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="recent-heading">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="recent-heading" className="text-base font-semibold text-primary">
          Recent items
        </h2>
        <Link href="/inventory" className="flex items-center gap-1 text-sm text-accent-text underline-offset-4 hover:underline">
          All inventory <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
      <ul className="hide-scrollbar -mx-(--gutter) flex snap-x gap-3 overflow-x-auto px-(--gutter) pb-1 md:mx-0 md:px-0">
        {items.map((item) => {
          const sold = isSoldStatus(item.status);
          return (
            <li key={item.id} className="w-36 shrink-0 snap-start sm:w-40">
              <Link href={`/items/${item.id}`} className="group block rounded-sm outline-none">
                <div className="aspect-square overflow-hidden rounded-sm border border-border-subtle bg-surface-sunken">
                  <CoverImage cover={item.cover} alt={item.title} muted={sold} className="transition-transform duration-(--dur-slow) ease-(--ease-out) group-hover:scale-[1.02]" />
                </div>
                <p className="mt-2 truncate text-sm font-medium text-primary">{item.title}</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <Money cents={sold ? item.soldPrice : item.listPrice ?? item.estimatedValue} compact className="text-sm text-secondary" />
                  <ItemStatusBadge status={item.status} className="h-5 text-[10px]" />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
