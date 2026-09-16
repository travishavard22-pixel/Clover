"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import * as D from "@radix-ui/react-dialog";
import { primaryNav, secondaryNav } from "./nav-config";

const EVENT = "clover:command-palette";
export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent(EVENT));
}

type ItemHit = { id: string; title: string; sku: string; status: string };

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ItemHit[]>([]);
  const router = useRouter();

  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener(EVENT, onOpen);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(EVENT, onOpen);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setHits([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/items/search?q=${encodeURIComponent(query)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then((d) => setHits(d.items ?? []))
        .catch(() => {});
    }, 120);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, open]);

  const go = (href: string) => {
    setOpen(false);
    setQuery("");
    router.push(href);
  };

  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-scrim animate-fade-in" />
        <D.Content className="fixed left-1/2 top-[12vh] z-50 w-[min(92vw,640px)] -translate-x-1/2 overflow-hidden rounded-md border border-border-default bg-surface-floating shadow-lift">
          <D.Title className="sr-only">Command palette</D.Title>
          <D.Description className="sr-only">Search items or jump to a page</D.Description>
          <Command label="Command palette" shouldFilter={hits.length === 0}>
            <Command.Input value={query} onValueChange={setQuery} placeholder="Search items, or type a command…" className="h-12 w-full border-b border-border-subtle bg-transparent px-4 text-base outline-none placeholder:text-muted" autoFocus />
            <Command.List className="max-h-[50vh] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-8 text-center text-sm text-muted">No results.</Command.Empty>
              {hits.length > 0 && (
                <Command.Group heading="Items" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted">
                  {hits.map((h) => (
                    <Command.Item key={h.id} value={`item-${h.id}`} onSelect={() => go(`/items/${h.id}`)} className="flex cursor-pointer items-center gap-3 rounded-xs px-2.5 py-2 text-sm data-[selected=true]:bg-surface-sunken">
                      <span className="flex-1 truncate">{h.title}</span>
                      <span className="font-mono text-xs text-muted">{h.sku}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              <Command.Group heading="Actions" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted">
                <Command.Item value="sell new item scan" onSelect={() => go("/sell")} className="flex cursor-pointer items-center gap-3 rounded-xs px-2.5 py-2 text-sm data-[selected=true]:bg-surface-sunken">
                  Sell a new item <span className="ml-auto font-mono text-xs text-muted">N</span>
                </Command.Item>
              </Command.Group>
              <Command.Group heading="Go to" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted">
                {[...primaryNav, ...secondaryNav].map((n) => (
                  <Command.Item key={n.href} value={`go ${n.label}`} onSelect={() => go(n.href)} className="flex cursor-pointer items-center gap-3 rounded-xs px-2.5 py-2 text-sm data-[selected=true]:bg-surface-sunken">
                    <n.icon className="size-4 text-muted" aria-hidden /> {n.label}
                    {n.shortcut && <span className="ml-auto font-mono text-xs text-muted">{n.shortcut}</span>}
                  </Command.Item>
                ))}
              </Command.Group>
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
