import Link from "next/link";
import { ArrowRight, Images } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ItemStatus } from "@/lib/db";
import { ITEM_STATUS_META } from "@/lib/items/status";
import { cn } from "@/lib/utils/cn";
import { relativeTime } from "./relative-time";

export type DraftSummary = {
  id: string;
  title: string;
  sku: string;
  status: ItemStatus;
  photoCount: number;
  coverUrl: string | null;
  updatedAt: string;
  /** Where "Continue" goes: review for drafts with photos, the camera for empty drafts, the analysis screen while analyzing. */
  href: string;
};

/** Photo-first draft card for "Continue a draft". Server-renderable. */
export function DraftCard({ draft, className }: { draft: DraftSummary; className?: string }) {
  const meta = ITEM_STATUS_META[draft.status];
  const action = draft.status === "ANALYZING" ? "View progress" : draft.photoCount === 0 ? "Add photos" : "Review photos";
  return (
    <li className={cn("list-none", className)}>
      <Link href={draft.href} className="group flex items-stretch gap-4 rounded-sm border border-border-subtle bg-surface-raised p-3 transition-colors hover:border-border-default hover:bg-surface-sunken">
        <div className="relative size-24 shrink-0 overflow-hidden rounded-xs bg-surface-sunken sm:size-28">
          {draft.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed same-origin URL
            <img src={draft.coverUrl} alt="" className="size-full object-cover" loading="lazy" />
          ) : (
            <span className="flex size-full items-center justify-center text-muted">
              <Images className="size-6" strokeWidth={1.5} aria-hidden />
            </span>
          )}
          {draft.photoCount > 1 && <span className="absolute bottom-1.5 right-1.5 rounded-full bg-scrim px-1.5 text-[11px] font-medium tabular text-white">{draft.photoCount}</span>}
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-base font-semibold text-primary">{draft.title}</h3>
              <Badge tone={meta.tone} className="shrink-0">
                {meta.label}
              </Badge>
            </div>
            <p className="mt-0.5 text-sm text-secondary">
              {draft.photoCount === 0 ? "No photos yet" : `${draft.photoCount} ${draft.photoCount === 1 ? "photo" : "photos"}`} · <span className="font-mono text-xs">{draft.sku}</span>
            </p>
          </div>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted">{relativeTime(draft.updatedAt)}</span>
            <span className="inline-flex items-center gap-1 font-medium text-accent-text">
              {action}
              <ArrowRight className="size-4 transition-transform duration-(--dur-fast) ease-(--ease-out) group-hover:translate-x-0.5" aria-hidden />
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
}
