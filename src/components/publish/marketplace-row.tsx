"use client";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, ExternalLink, ListChecks, Plug } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-classes";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/switch";
import { ModeBadge } from "@/components/marketplaces/mode-badge";
import { MonogramTile } from "@/components/marketplaces/monogram-tile";
import { PublicationStatusBadge } from "@/components/marketplaces/publication-status-badge";
import type { JobOutcome } from "@/hooks/use-job-events";
import type { PublishRow } from "@/lib/marketplaces/publications";
import { cn } from "@/lib/utils/cn";
import { connectUrl, type PublicationMutation } from "./publish-api";
import { PublishProgress } from "./publish-progress";
import { PublishedActions } from "./published-actions";
import { RowPreview } from "./row-preview";

export type MarketplaceRowProps = {
  row: PublishRow;
  itemId: string;
  returnTo: string;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  /** A PUBLISH / end / reprice job to follow live, if one is running. */
  activeJobId: string | null;
  onJobSettled: (outcome: JobOutcome) => void;
  onOpenChecklist: () => void;
  onMutation: (result: PublicationMutation) => void;
  index: number;
};

const BUSY = new Set(["PUBLISHING"]);

/**
 * One marketplace on the publish hub: identity, mode, connection, the preview of what will be
 * sent, the publication's real state and the actions that fit it. The include checkbox is
 * replaced by the reason when the row cannot be published right now.
 */
export function MarketplaceRow({ row, itemId, returnTo, selected, onSelect, activeJobId, onJobSettled, onOpenChecklist, onMutation, index }: MarketplaceRowProps) {
  const reduce = useReducedMotion();
  const p = row.publication;
  const live = p?.status === "PUBLISHED";
  const busy = p ? BUSY.has(p.status) || !!activeJobId : false;
  const includable = !row.blocked && !live && !busy && p?.status !== "SOLD" && p?.status !== "REQUIRES_USER_ACTION";
  const checkboxId = `include-${row.marketplace}`;
  const assisted = row.mode === "assisted";
  const checklistDone = p ? p.checklist.filter((s) => s.done).length : 0;

  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1], delay: reduce ? 0 : Math.min(index, 6) * 0.04 }}
      className={cn("surface-card relative p-4 transition-[border-color] duration-(--dur-fast) sm:p-5", selected && includable && "border-accent")}
      aria-labelledby={`row-${row.marketplace}-name`}
    >
      <div className="flex gap-3 sm:gap-4">
        <div className="flex shrink-0 flex-col items-center gap-3 pt-0.5">
          {includable ? (
            <Checkbox id={checkboxId} checked={selected} onCheckedChange={(v) => onSelect(v === true)} aria-label={`Include ${row.name}`} className="size-6 rounded-[7px]" />
          ) : (
            <span className="flex size-6 items-center justify-center" aria-hidden>
              {live ? <CheckCircle2 className="size-5 text-success" /> : <span className="size-2 rounded-full bg-border-strong" />}
            </span>
          )}
          <MonogramTile shortName={row.shortName} name={row.name} color={row.color} size="md" className="hidden sm:inline-flex" />
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <MonogramTile shortName={row.shortName} name={row.name} color={row.color} size="sm" className="sm:hidden" />
            <label id={`row-${row.marketplace}-name`} htmlFor={includable ? checkboxId : undefined} className="text-base font-semibold text-primary">
              {row.name}
            </label>
            <ModeBadge mode={row.mode} explanation={row.modeExplanation} marketplaceName={row.name} />
            {row.isDefault && <Badge tone="neutral">Default</Badge>}
            {p && <PublicationStatusBadge status={p.status} live />}
          </div>

          <ConnectionLine row={row} returnTo={returnTo} />

          <RowPreview preview={row.preview} marketplaceShortName={row.shortName} />

          {row.blocked && !live && !p?.status.startsWith("REQUIRES") && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-secondary">
              <AlertTriangle className="size-3.5 text-warning" aria-hidden />
              {row.blocked}
              {row.blocked.startsWith("Set a list price") || row.blocked.startsWith("Add at least one photo") ? (
                <Link href={`/items/${itemId}#listing`} className="text-accent-text hover:underline">
                  Fix
                </Link>
              ) : null}
            </p>
          )}

          {activeJobId && <PublishProgress jobId={activeJobId} initialSteps={undefined} initialStatus={p?.jobStatus ?? null} onSettled={onJobSettled} compact />}

          {p?.status === "NEEDS_ATTENTION" && p.attention && !activeJobId && (
            <div role="status" className="rounded-xs border border-warning/40 bg-warning-soft px-3 py-2 text-sm">
              <p className="font-medium text-primary">{p.attention.message}</p>
              <p className="mt-0.5 text-secondary">{p.attention.recovery}</p>
              <Link href={`/items/${itemId}#listing`} className="mt-1.5 inline-flex items-center gap-1 text-sm font-medium text-accent-text hover:underline">
                Fix <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </div>
          )}

          {p?.status === "FAILED" && p.lastError && !activeJobId && (
            <div role="status" className="rounded-xs border border-danger/40 bg-danger-soft px-3 py-2 text-sm">
              <p className="font-medium text-primary">Publishing failed — nothing was posted.</p>
              <p className="mt-0.5 text-secondary">{p.lastError}</p>
            </div>
          )}

          {p?.status === "REQUIRES_USER_ACTION" && !activeJobId && (
            <div className="rounded-xs border border-border-subtle bg-surface-sunken px-3 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 text-sm">
                  <p className="font-medium text-primary">{p.attention?.message ?? `Finish posting on ${row.name}`}</p>
                  <p className="text-xs text-secondary">{p.attention?.recovery ?? `${checklistDone} of ${p.checklist.length} steps done. Copy, download, post, then confirm here.`}</p>
                </div>
                <Button size="sm" onClick={onOpenChecklist} leadingIcon={<ListChecks className="size-4" aria-hidden />}>
                  {p.attention ? "Show steps" : checklistDone > 0 ? "Continue checklist" : "Open checklist"}
                </Button>
              </div>
            </div>
          )}

          {p && (live || p.status === "ENDED" || p.status === "FAILED" || p.status === "NEEDS_ATTENTION") && !activeJobId && (
            <PublishedActions publication={p} marketplaceName={row.name} assisted={assisted} onChanged={onMutation} />
          )}

          {p?.status === "SOLD" && (
            <p className="text-sm text-secondary">
              Sold here{p.externalUrl ? (
                <>
                  {" · "}
                  <a href={p.externalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent-text hover:underline">
                    View listing <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                </>
              ) : null}
            </p>
          )}

          {row.rowNote && <p className="text-xs text-secondary">{row.rowNote}</p>}
        </div>
      </div>
    </motion.li>
  );
}

function ConnectionLine({ row, returnTo }: { row: PublishRow; returnTo: string }) {
  if (!row.connectable) return null;
  const href = connectUrl(row.marketplace, returnTo);
  if (row.connectionStatus === "CONNECTED") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-secondary">
        <Plug className="size-3.5 text-success" aria-hidden />
        Connected{row.accountName ? ` as ${row.accountName}` : ""}
        {row.mode === "demo" && <span className="text-muted">· demo connection</span>}
      </p>
    );
  }
  const label = row.connectionStatus === "NEEDS_REAUTH" ? `Reauthorize ${row.shortName}` : row.connectionStatus === "ERROR" ? `Reconnect ${row.shortName}` : `Connect ${row.shortName}`;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-secondary">
      <span className="inline-flex items-center gap-1.5">
        <Plug className="size-3.5 text-muted" aria-hidden />
        {row.connectionStatus === "NEEDS_REAUTH" ? "Authorization expired" : row.connectionStatus === "ERROR" ? "Connection error" : "Not connected"}
      </span>
      <a href={href} className={buttonClasses("outline", "sm")}>
        {label}
      </a>
    </div>
  );
}
