"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Package } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-classes";
import { EmptyState, Kbd } from "@/components/ui/card";
import type { BatchInput, BatchResult } from "@/lib/inventory/batch";
import { filtersToSearchParams } from "@/lib/inventory/filters";
import type { ItemListDTO, ListFilters, ListResult } from "@/lib/inventory/types";
import { cn } from "@/lib/utils/cn";
import { BatchBar } from "./batch-bar";
import { InventorySkeleton } from "./inventory-skeleton";
import { InventoryToolbar } from "./inventory-toolbar";
import { inventoryApi } from "./inventory-api";
import { ItemCard } from "./item-card";
import { ItemRow } from "./item-row";
import { QuickEditSheet } from "./quick-edit-sheet";
import { useDensity } from "./use-density";

type LoadState = "idle" | "refresh" | "more";

function sameFilters(a: ListFilters, b: ListFilters) {
  return filtersToSearchParams({ ...a, cursor: null }).toString() === filtersToSearchParams({ ...b, cursor: null }).toString();
}

/**
 * The inventory workspace. Server-rendered first page, then the client owns filters (mirrored to the
 * URL), cursor pagination, selection, keyboard navigation and the quick-edit sheet.
 */
export function InventoryBrowser({ initial, initialFilters, hasAnyItems }: { initial: ListResult; initialFilters: ListFilters; hasAnyItems: boolean }) {
  const [filters, setFilters] = useState<ListFilters>({ ...initialFilters, cursor: null });
  const [items, setItems] = useState<ItemListDTO[]>(initial.items);
  const [nextCursor, setNextCursor] = useState<string | null>(initial.nextCursor);
  const [load, setLoad] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [density, setDensity, densityReady] = useDensity();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [editing, setEditing] = useState<ItemListDTO | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const lastFilters = useRef<ListFilters>(filters);
  const abort = useRef<AbortController | null>(null);
  const cardRefs = useRef<Array<HTMLElement | null>>([]);
  const lastToggled = useRef<string | null>(null);

  // Refetch whenever filters change (skip the first render: the server already rendered this page).
  useEffect(() => {
    if (sameFilters(lastFilters.current, filters)) return;
    lastFilters.current = filters;
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setLoad("refresh");
    setError(null);
    const sp = filtersToSearchParams({ ...filters, cursor: null });
    const url = `${window.location.pathname}${sp.toString() ? `?${sp}` : ""}`;
    window.history.replaceState(window.history.state, "", url);
    inventoryApi
      .list({ ...filters, cursor: null }, ctrl.signal)
      .then((res) => {
        setItems(res.items);
        setNextCursor(res.nextCursor);
        setFocusIndex(0);
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Couldn't load items");
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoad("idle");
      });
    return () => ctrl.abort();
  }, [filters]);

  const loadMore = async () => {
    if (!nextCursor || load !== "idle") return;
    setLoad("more");
    try {
      const res = await inventoryApi.list({ ...filters, cursor: nextCursor });
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.id));
        return [...prev, ...res.items.filter((i) => !seen.has(i.id))];
      });
      setNextCursor(res.nextCursor);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't load more");
    } finally {
      setLoad("idle");
    }
  };

  const onFilterChange = useCallback((patch: Partial<ListFilters>) => {
    setFilters((f) => ({ ...f, ...patch, cursor: null }));
    setSelected(new Set());
  }, []);

  const replaceItem = useCallback((item: ItemListDTO) => {
    setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));
    setEditing((e) => (e && e.id === item.id ? item : e));
  }, []);
  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setSelected((s) => {
      if (!s.has(id)) return s;
      const n = new Set(s);
      n.delete(id);
      return n;
    });
  }, []);

  const toggle = (item: ItemListDTO, shiftKey: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastToggled.current) {
        const a = items.findIndex((i) => i.id === lastToggled.current);
        const b = items.findIndex((i) => i.id === item.id);
        if (a >= 0 && b >= 0) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          for (let k = lo; k <= hi; k++) next.add(items[k]!.id);
          return next;
        }
      }
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
    lastToggled.current = item.id;
    setSelectionMode(true);
  };
  const clearSelection = () => {
    setSelected(new Set());
    setSelectionMode(false);
  };
  useEffect(() => {
    if (selected.size === 0) setSelectionMode(false);
  }, [selected.size]);

  const onBatchDone = (result: BatchResult, input: BatchInput) => {
    const okIds = new Set(result.results.filter((r) => r.ok).map((r) => r.id));
    if (input.op === "export_csv") return;
    if (input.op === "delete") {
      const deleted = new Set(result.results.filter((r) => r.ok && r.after === "deleted").map((r) => r.id));
      setItems((prev) => prev.filter((i) => !deleted.has(i.id)).map((i) => (okIds.has(i.id) && !deleted.has(i.id) ? { ...i, status: "ARCHIVED" as const } : i)));
    } else if (input.op === "set_storage") {
      setItems((prev) => prev.map((i) => (okIds.has(i.id) ? { ...i, storageLocation: input.params.storageLocation } : i)));
    } else if (input.op === "reprice") {
      const after = new Map(result.results.filter((r) => r.ok).map((r) => [r.id, r.after as number]));
      setItems((prev) => prev.map((i) => (after.has(i.id) ? { ...i, listPrice: after.get(i.id)! } : i)));
    } else {
      const after = new Map(result.results.filter((r) => r.ok).map((r) => [r.id, r.after as ItemListDTO["status"]]));
      setItems((prev) => prev.map((i) => (after.has(i.id) ? { ...i, status: after.get(i.id)! } : i)));
    }
    clearSelection();
    // Status changes can move items out of the current filter — refresh quietly.
    if (input.op !== "set_storage" && input.op !== "reprice") {
      inventoryApi
        .list({ ...filters, cursor: null })
        .then((res) => {
          setItems(res.items);
          setNextCursor(res.nextCursor);
        })
        .catch(() => {});
    }
  };

  // Keyboard: arrows move focus, Enter opens, x toggles selection, Escape clears selection.
  const columns = () => {
    if (density === "compact") return 1;
    const first = cardRefs.current[0];
    if (!first) return 1;
    const top = first.getBoundingClientRect().top;
    let n = 0;
    for (const el of cardRefs.current) {
      if (!el) break;
      if (Math.abs(el.getBoundingClientRect().top - top) < 2) n++;
      else break;
    }
    return Math.max(1, n);
  };
  const focusAt = (idx: number) => {
    const clamped = Math.max(0, Math.min(items.length - 1, idx));
    setFocusIndex(clamped);
    cardRefs.current[clamped]?.focus({ preventScroll: false });
  };
  const onGridKeyDown = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "BUTTON" || target.closest("[role=dialog]")) return;
    const cols = columns();
    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        focusAt(focusIndex + 1);
        break;
      case "ArrowLeft":
        e.preventDefault();
        focusAt(focusIndex - 1);
        break;
      case "ArrowDown":
        e.preventDefault();
        if (focusIndex + cols >= items.length && nextCursor && load === "idle") void loadMore();
        focusAt(focusIndex + cols);
        break;
      case "ArrowUp":
        e.preventDefault();
        focusAt(focusIndex - cols);
        break;
      case "Home":
        e.preventDefault();
        focusAt(0);
        break;
      case "End":
        e.preventDefault();
        focusAt(items.length - 1);
        break;
      case "Enter": {
        e.preventDefault();
        const item = items[focusIndex];
        if (item) setEditing(item);
        break;
      }
      case "x":
      case "X": {
        e.preventDefault();
        const item = items[focusIndex];
        if (item) toggle(item, e.shiftKey);
        break;
      }
      case "Escape":
        if (selected.size) {
          e.preventDefault();
          clearSelection();
        }
        break;
      case "a":
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          setSelected(new Set(items.map((i) => i.id)));
          setSelectionMode(true);
        }
        break;
    }
  };

  const ids = useMemo(() => items.filter((i) => selected.has(i.id)).map((i) => i.id), [items, selected]);
  const hasFilters = !!filters.q?.trim() || (filters.status?.length ?? 0) > 0 || !!filters.marketplace;
  const showSkeleton = load === "refresh" && items.length === 0;

  return (
    <div className="space-y-4">
      <InventoryToolbar filters={filters} onChange={onFilterChange} density={density} onDensity={setDensity} resultCount={load === "refresh" ? null : items.length} searching={load === "refresh"} />

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-primary">
          <span>{error}</span>
          <Button size="sm" variant="outline" onClick={() => setFilters((f) => ({ ...f }))}>
            Retry
          </Button>
        </div>
      )}

      {!hasAnyItems && items.length === 0 && !hasFilters ? (
        <EmptyState
          title="What are you selling?"
          description="Photograph an item and Clover will identify it, estimate a price from comparable listings and write the listing for you."
          icon={<Camera className="size-8" strokeWidth={1.5} />}
          action={
            <Link href="/sell" className={buttonClasses("primary", "lg")}>
              <Camera className="size-5" aria-hidden /> Sell your first item
            </Link>
          }
        />
      ) : showSkeleton ? (
        <InventorySkeleton density={density} />
      ) : items.length === 0 ? (
        <EmptyState
          serif={false}
          title="No items match"
          description={filters.q?.trim() ? `Nothing in your inventory matches “${filters.q.trim()}” with these filters.` : "Try a different status or marketplace."}
          icon={<Package className="size-7" strokeWidth={1.5} />}
          action={
            <Button variant="outline" onClick={() => onFilterChange({ q: "", status: [], marketplace: undefined, includeArchived: false })}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className={cn("transition-opacity duration-(--dur-base)", load === "refresh" && "opacity-60")} onKeyDown={onGridKeyDown} aria-busy={load !== "idle"}>
          {!densityReady ? (
            <InventorySkeleton density="comfortable" count={items.length} />
          ) : density === "compact" ? (
            <div className="surface-card overflow-x-auto">
              <table className="w-full text-left" aria-label="Inventory">
                <thead className="text-xs font-medium text-muted">
                  <tr className="border-b border-border-subtle">
                    <th scope="col" className="w-10 px-2 py-2">
                      <span className="sr-only">Select</span>
                    </th>
                    <th scope="col" className="w-12 px-1 py-2">
                      <span className="sr-only">Photo</span>
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">Item</th>
                    <th scope="col" className="px-3 py-2 font-medium">Status</th>
                    <th scope="col" className="hidden px-3 py-2 font-medium md:table-cell">Marketplaces</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Price</th>
                    <th scope="col" className="hidden px-3 py-2 text-right font-medium lg:table-cell">Profit</th>
                    <th scope="col" className="hidden px-3 py-2 text-right font-medium sm:table-cell">Days</th>
                    <th scope="col" className="hidden px-3 py-2 text-right font-medium lg:table-cell">Offers</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <ItemRow
                      key={item.id}
                      ref={(el) => {
                        cardRefs.current[idx] = el;
                      }}
                      item={item}
                      selected={selected.has(item.id)}
                      selectionMode={selectionMode}
                      onOpen={setEditing}
                      onToggle={toggle}
                      onLongPress={(i) => toggle(i, false)}
                      tabIndex={idx === focusIndex ? 0 : -1}
                      onFocus={() => setFocusIndex(idx)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5" aria-label="Inventory">
              {items.map((item, idx) => (
                <li key={item.id} className="min-w-0">
                  <ItemCard
                    ref={(el) => {
                      cardRefs.current[idx] = el;
                    }}
                    item={item}
                    selected={selected.has(item.id)}
                    selectionMode={selectionMode}
                    onOpen={setEditing}
                    onToggle={toggle}
                    onLongPress={(i) => toggle(i, false)}
                    tabIndex={idx === focusIndex ? 0 : -1}
                    onFocus={() => setFocusIndex(idx)}
                  />
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-col items-center gap-3 py-6">
            {nextCursor ? (
              <Button variant="outline" onClick={loadMore} loading={load === "more"}>
                Load more
              </Button>
            ) : (
              <p className="text-xs text-muted tabular">
                {items.length} item{items.length === 1 ? "" : "s"}
              </p>
            )}
            <p className="hidden items-center gap-2 text-xs text-muted lg:flex">
              <Kbd>↑↓←→</Kbd> move <Kbd>↵</Kbd> open <Kbd>x</Kbd> select <Kbd>/</Kbd> search
            </p>
          </div>
        </div>
      )}

      <BatchBar
        count={selected.size}
        total={items.length}
        allSelected={items.length > 0 && selected.size === items.length}
        onSelectAll={(on) => {
          setSelected(on ? new Set(items.map((i) => i.id)) : new Set());
          setSelectionMode(on);
        }}
        onClear={clearSelection}
        ids={ids}
        onDone={onBatchDone}
      />

      <QuickEditSheet item={editing} open={!!editing} onClose={() => setEditing(null)} onItemChange={replaceItem} onItemRemoved={removeItem} />
    </div>
  );
}
