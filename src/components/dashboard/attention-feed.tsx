"use client";
import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, CircleAlert, FileText, Inbox, Plug, Sparkles, Timer } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonClasses } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import type { AttentionAction, AttentionKind, AttentionRow } from "@/lib/inventory/types";
import { cn } from "@/lib/utils/cn";
import { CoverImage } from "@/components/inventory/cover-image";
import { relativeTime } from "@/components/inventory/format";

const KIND_ICON: Record<AttentionKind, typeof Inbox> = { offer: Inbox, publication: CircleAlert, recommendation: Sparkles, stale: Timer, draft: FileText, connection: Plug };
const KIND_LABEL: Record<AttentionKind, string> = { offer: "Offer", publication: "Listing", recommendation: "Suggestion", stale: "Stale", draft: "Draft", connection: "Connection" };

/**
 * "What needs me now." Rows are ordered by urgency; each has one primary action (a link) and, for
 * recommendations, in-place apply / snooze / dismiss.
 */
export function AttentionFeed({ rows: initial, compact }: { rows: AttentionRow[]; compact?: boolean }) {
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const reduce = useReducedMotion();

  const act = async (row: AttentionRow, action: AttentionAction) => {
    setBusy(`${row.id}:${action.key}`);
    try {
      const res = await fetch(action.href, { method: action.method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(action.body ?? {}) });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? `Couldn't ${action.label.toLowerCase()} (${res.status})`);
      }
      setRows((r) => r.filter((x) => x.id !== row.id));
      toast.success(action.key === "apply" ? "Applied" : action.key === "snooze" ? "Snoozed for 3 days" : "Dismissed", { description: row.title });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That didn't work");
    } finally {
      setBusy(null);
    }
  };

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border-default px-6 py-10 text-center">
        <p className="serif-display text-2xl text-primary">Nothing needs you right now.</p>
        <p className="mt-1.5 text-sm text-secondary">Offers, listing problems and suggestions will show up here.</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border-subtle" aria-label="Needs attention" aria-live="polite">
      <AnimatePresence initial={false}>
        {rows.map((row) => {
          const Icon = KIND_ICON[row.kind];
          const isBusy = busy?.startsWith(row.id) ?? false;
          return (
            <motion.li
              key={row.id}
              layout={!reduce}
              initial={false}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: 12 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              className={cn("flex items-start gap-3 py-3", compact ? "px-0" : "px-1")}
            >
              <div className="relative size-11 shrink-0 overflow-hidden rounded-[8px] bg-surface-sunken">
                {row.cover ? (
                  <CoverImage cover={row.cover} alt="" />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted">
                    <Icon className="size-5" strokeWidth={1.5} aria-hidden />
                  </div>
                )}
                {row.severity === 1 && <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-surface-raised bg-warning" aria-hidden />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted">
                  <Icon className="size-3" aria-hidden />
                  {KIND_LABEL[row.kind]}
                  {row.severity === 1 && <span className="text-warning">· act now</span>}
                  <span className="ml-auto font-normal normal-case tracking-normal tabular">{relativeTime(row.at)}</span>
                </div>
                <p className="mt-0.5 truncate text-sm font-medium text-primary">{row.title}</p>
                <p className="line-clamp-2 text-sm text-secondary">{row.body}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Link href={row.href} className={buttonClasses(row.severity === 1 ? "primary" : "outline", "sm", "h-8")}>
                    {row.actionLabel}
                    <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                  {row.actions.length > 0 && (
                    <>
                      {row.actions
                        .filter((a) => a.key === "apply")
                        .map((a) => (
                          <Button key={a.key} size="sm" variant="secondary" className="h-8" loading={busy === `${row.id}:${a.key}`} disabled={isBusy} onClick={() => act(row, a)}>
                            {a.label}
                          </Button>
                        ))}
                      <Menu>
                        <MenuTrigger asChild>
                          <Button size="sm" variant="ghost" className="h-8 text-muted" disabled={isBusy}>
                            More
                          </Button>
                        </MenuTrigger>
                        <MenuContent>
                          {row.actions
                            .filter((a) => a.key !== "apply")
                            .map((a) => (
                              <MenuItem key={a.key} onSelect={() => act(row, a)}>
                                {a.label}
                              </MenuItem>
                            ))}
                        </MenuContent>
                      </Menu>
                    </>
                  )}
                </div>
              </div>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}
