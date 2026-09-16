"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, BadgeDollarSign, Camera, MoreHorizontal, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import { MarkSoldDialog } from "@/components/inventory/mark-sold-dialog";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-classes";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import type { ItemDetailDTO } from "@/lib/inventory/detail";
import { ITEM_STATUS_META, canTransition } from "@/lib/items/status";
import type { ItemSummary } from "@/lib/items/summary";
import { cn } from "@/lib/utils/cn";
import { InlineEdit } from "./inline-edit";
import { errorMessage, itemApi } from "./item-api";

/**
 * Title (inline-editable), SKU, status and the primary actions. The overflow menu holds the
 * destructive or rarer actions; each one says what it does before doing it.
 */
export function ItemHeader({ summary, onTitle, onRefresh, announce }: { summary: ItemSummary; onTitle: (title: string) => Promise<void>; onRefresh: () => Promise<void>; announce: (m: string) => void }) {
  const { item, demo, analysis } = summary;
  const router = useRouter();
  const meta = ITEM_STATUS_META[item.status];
  const [soldTarget, setSoldTarget] = useState<ItemDetailDTO | null>(null);
  const [busy, setBusy] = useState<"reanalyze" | "archive" | "sold" | null>(null);
  const analyzing = item.status === "ANALYZING" || analysis?.status === "RUNNING" || analysis?.status === "QUEUED";
  const canArchive = canTransition(item.status, "ARCHIVED");
  const canSell = canTransition(item.status, "SOLD");
  const canReanalyze = canTransition(item.status, "ANALYZING") && summary.photos.length > 0;

  const reanalyze = async () => {
    setBusy("reanalyze");
    try {
      const { jobId, reused } = await itemApi.reanalyze(item.id);
      if (reused) toast("Already analyzing", { description: "Following the run that is in progress." });
      router.push(`/items/${item.id}/analyzing?job=${jobId}`);
    } catch (err) {
      toast.error("Couldn't start re-analysis", { description: errorMessage(err), action: { label: "Retry", onClick: () => void reanalyze() } });
    } finally {
      setBusy(null);
    }
  };

  const archive = async () => {
    setBusy("archive");
    try {
      await itemApi.setStatus(item.id, "ARCHIVED");
      announce("Item archived");
      toast("Archived", { description: "Hidden from active inventory. You can restore it from the inventory filters." });
      await onRefresh();
    } catch (err) {
      toast.error("Couldn't archive", { description: errorMessage(err), action: { label: "Retry", onClick: () => void archive() } });
    } finally {
      setBusy(null);
    }
  };

  const openSold = async () => {
    setBusy("sold");
    try {
      setSoldTarget(await itemApi.detail(item.id));
    } catch (err) {
      toast.error("Couldn't load sale details", { description: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <header className="flex flex-col gap-4 py-5 md:flex-row md:items-start md:justify-between md:py-7">
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs">
          <Link href="/inventory" className="text-muted hover:text-primary">
            Inventory
          </Link>
          <span className="text-muted" aria-hidden>
            /
          </span>
          <span className="font-mono text-secondary" aria-label={`SKU ${item.sku}`}>
            {item.sku}
          </span>
          <Badge tone={meta.tone} title={meta.description}>
            {meta.label}
          </Badge>
          {demo && <DemoBadge />}
        </div>
        <h1 className="min-w-0">
          <InlineEdit value={item.title === "Untitled item" ? "" : item.title} placeholder="Untitled item — add a title" label="item title" maxLength={200} onSave={onTitle} displayClassName="display text-2xl md:text-3xl text-primary -mx-1 px-1" inputClassName="display text-xl md:text-2xl h-11" />
        </h1>
        {analyzing && (
          <p className="mt-2 text-sm text-secondary">
            Analysis is running.{" "}
            <Link href={`/items/${item.id}/analyzing${analysis ? `?job=${analysis.id}` : ""}`} className="text-accent-text underline-offset-4 hover:underline">
              Follow its progress
            </Link>
            . Values below are from the last completed run.
          </p>
        )}
        {analysis?.status === "FAILED" && analysis.error && (
          <p role="status" className="mt-2 text-sm text-danger">
            The last analysis did not finish: {analysis.error}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Link href={`/items/${item.id}/studio`} className={buttonClasses("outline", "md")}>
          <Camera className="size-4" aria-hidden />
          Studio
        </Link>
        <Link href={`/items/${item.id}/publish`} className={cn(buttonClasses("primary", "md"), "hidden lg:inline-flex")}>
          <Send className="size-4" aria-hidden />
          Publish
        </Link>
        <Menu>
          <MenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label="More actions" loading={busy !== null}>
              <MoreHorizontal className="size-4" />
            </Button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem disabled={!canReanalyze || analyzing} onSelect={() => void reanalyze()}>
              <RefreshCw className="size-4" aria-hidden />
              Re-analyze photos
            </MenuItem>
            <MenuItem disabled={!canSell} onSelect={() => void openSold()}>
              <BadgeDollarSign className="size-4" aria-hidden />
              Mark as sold
            </MenuItem>
            <MenuSeparator />
            <MenuItem destructive disabled={!canArchive} onSelect={() => void archive()}>
              <Archive className="size-4" aria-hidden />
              Archive item
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
      {soldTarget && (
        <MarkSoldDialog
          item={soldTarget}
          open
          onClose={() => setSoldTarget(null)}
          onSold={() => {
            setSoldTarget(null);
            announce("Sale recorded");
            void onRefresh();
          }}
        />
      )}
    </header>
  );
}
