"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ExternalLink, Tag } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button-classes";
import { MenuItem } from "@/components/ui/menu";
import { Money } from "@/components/ui/money";
import { get } from "@/components/marketplaces/api-client";
import { daysLiveLabel } from "@/components/marketplaces/format";
import { MonogramTile } from "@/components/marketplaces/monogram-tile";
import { PublicationStatusBadge } from "@/components/marketplaces/publication-status-badge";
import { PublishProgress } from "@/components/publish/publish-progress";
import { PublishedActions } from "@/components/publish/published-actions";
import type { PublicationMutation } from "@/components/publish/publish-api";
import { listingFiltersToQuery, type ListingDTO, type ListingFilters } from "@/lib/marketplaces/listings";
import { ListingCard } from "./listing-card";
import { ListingsFilters, type ListingsView } from "./listings-filters";

const VIEW_KEY = "clover.listings.view";

/**
 * Every publication across the seller's items. Filters live in the URL so a filtered board can be
 * shared or bookmarked; data reloads from /api/publications when they change.
 */
export function ListingsBoard({ initial, initialFilters, hasAny }: { initial: ListingDTO[]; initialFilters: ListingFilters; hasAny: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [filters, setFilters] = useState(initialFilters);
  const [listings, setListings] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<ListingsView>("cards");
  const [jobs, setJobs] = useState<Record<string, string>>({});
  const first = useRef(true);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VIEW_KEY);
      if (saved === "table" || saved === "cards") setView(saved);
    } catch {
      // storage unavailable — default view is fine
    }
  }, []);

  const changeView = (v: ListingsView) => {
    setView(v);
    try {
      window.localStorage.setItem(VIEW_KEY, v);
    } catch {
      // ignore
    }
  };

  const reload = useCallback(
    async (f: ListingFilters) => {
      setLoading(true);
      try {
        const res = await get<{ listings: ListingDTO[] }>(`/api/publications${listingFiltersToQuery(f)}`);
        setListings(res.listings);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't load listings.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Debounced URL sync + reload when filters change (skip the initial render — the server already rendered it).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      router.replace(`${pathname}${listingFiltersToQuery(filters)}`, { scroll: false });
      void reload(filters);
    }, 250);
    return () => clearTimeout(t);
  }, [filters, pathname, router, reload]);

  const onChanged = useCallback(
    (id: string, result: PublicationMutation) => {
      setListings((ls) => ls.map((l) => (l.publication.id === id ? { ...l, publication: result.publication, statusLabel: statusLabel(result.publication.status) } : l)));
      if (result.jobId) setJobs((j) => ({ ...j, [id]: result.jobId! }));
    },
    [],
  );

  const onSettled = useCallback(
    (id: string) => {
      setJobs((j) => {
        const n = { ...j };
        delete n[id];
        return n;
      });
      void reload(filters);
    },
    [filters, reload],
  );

  const grouped = useMemo(() => listings, [listings]);

  if (!hasAny) {
    return (
      <EmptyState
        title="Nothing listed yet"
        description="Publish an item from its page and it appears here with its live status on every marketplace."
        icon={<Tag className="size-8" strokeWidth={1.5} />}
        action={
          <Link href="/inventory" className={buttonClasses("primary", "md")}>
            Go to Inventory
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <ListingsFilters filters={filters} onChange={setFilters} view={view} onView={changeView} count={listings.length} />
      {Object.keys(jobs).length > 0 && (
        <div className="space-y-2 rounded-sm border border-border-subtle bg-surface-sunken p-3">
          {Object.entries(jobs).map(([id, jobId]) => {
            const l = listings.find((x) => x.publication.id === id);
            return (
              <div key={jobId}>
                <p className="mb-1 text-xs font-medium text-secondary">{l ? `${l.item.title} · ${l.marketplace.name}` : "Working…"}</p>
                <PublishProgress jobId={jobId} onSettled={() => onSettled(id)} compact />
              </div>
            );
          })}
        </div>
      )}
      <div aria-busy={loading} className={loading ? "opacity-70 transition-opacity" : "transition-opacity"}>
        {grouped.length === 0 ? (
          <EmptyState serif={false} title="No listings match" description="Try another marketplace or status." className="py-10" />
        ) : view === "table" ? (
          <ListingsTable listings={grouped} onChanged={onChanged} />
        ) : (
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4" aria-label="Listings">
            {grouped.map((l, i) => (
              <li key={l.publication.id}>
                <ListingCard listing={l} index={i} onChanged={(r) => onChanged(l.publication.id, r)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function statusLabel(status: ListingDTO["publication"]["status"]): string {
  const map: Record<string, string> = { READY: "Ready", NEEDS_ATTENTION: "Needs attention", PUBLISHING: "Publishing", PUBLISHED: "Live", FAILED: "Failed", REQUIRES_USER_ACTION: "Your turn", ENDED: "Ended", SOLD: "Sold" };
  return map[status] ?? status;
}

function ListingsTable({ listings, onChanged }: { listings: ListingDTO[]; onChanged: (id: string, result: PublicationMutation) => void }) {
  return (
    <div className="overflow-x-auto rounded-sm border border-border-subtle">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-surface-sunken text-left text-xs font-medium uppercase tracking-wide text-muted">
          <tr>
            <th scope="col" className="px-3 py-2">Item</th>
            <th scope="col" className="px-3 py-2">Marketplace</th>
            <th scope="col" className="px-3 py-2">Status</th>
            <th scope="col" className="px-3 py-2 text-right">Price</th>
            <th scope="col" className="px-3 py-2">Live</th>
            <th scope="col" className="px-3 py-2">Link</th>
            <th scope="col" className="px-3 py-2 text-right">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {listings.map((l) => {
            const p = l.publication;
            return (
              <tr key={p.id} className="hover:bg-surface-sunken/60">
                <td className="px-3 py-2">
                  <Link href={`/items/${l.item.id}/publish`} className="flex items-center gap-3 outline-none focus-visible:underline">
                    <span className="size-10 shrink-0 overflow-hidden rounded-xs bg-surface-sunken">{l.item.cover && <img src={l.item.cover.thumbUrl} alt="" width={40} height={40} className="h-full w-full object-cover" />}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-primary">{l.item.title}</span>
                      <span className="block text-xs text-muted tabular">{l.item.sku}</span>
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-2">
                    <MonogramTile shortName={l.marketplace.shortName} name={l.marketplace.name} color={l.marketplace.color} size="sm" />
                    {l.marketplace.shortName}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <PublicationStatusBadge status={p.status} live />
                  {p.attention && (p.status === "REQUIRES_USER_ACTION" || p.status === "NEEDS_ATTENTION") && <span className="mt-1 block max-w-xs text-xs text-warning">{p.attention.message}</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  <Money cents={p.price ?? l.item.listPrice} />
                </td>
                <td className="px-3 py-2 text-xs text-secondary tabular">{daysLiveLabel(l.daysLive) || "—"}</td>
                <td className="px-3 py-2">
                  {p.externalUrl ? (
                    <a href={p.externalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent-text hover:underline">
                      Open <ExternalLink className="size-3.5" aria-hidden />
                      <span className="sr-only"> on {l.marketplace.name} (new tab)</span>
                    </a>
                  ) : (
                    <span className="text-xs text-muted">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <PublishedActions
                    publication={p}
                    marketplaceName={l.marketplace.name}
                    assisted={p.mode === "ASSISTED"}
                    onChanged={(r) => onChanged(p.id, r)}
                    layout="menu"
                    extraMenu={
                      <MenuItem asChild>
                        <Link href={`/items/${l.item.id}`}>View item</Link>
                      </MenuItem>
                    }
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
