"use client";
import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown, Rocket } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DemoBadge } from "@/components/ui/badge";
import { Money } from "@/components/ui/money";
import { RequestError } from "@/components/marketplaces/api-client";
import type { JobOutcome } from "@/hooks/use-job-events";
import type { Marketplace } from "@/lib/db";
import type { PublicationDTO, PublishHubData, PublishRow } from "@/lib/marketplaces/publications";
import { cn } from "@/lib/utils/cn";
import { AssistedSheet } from "./assisted-sheet";
import { MarketplaceRow } from "./marketplace-row";
import { publishApi, type PublicationMutation } from "./publish-api";

const ACTIVE_JOB = new Set(["QUEUED", "RUNNING"]);

function includable(r: PublishRow): boolean {
  const s = r.publication?.status;
  return !r.blocked && s !== "PUBLISHED" && s !== "PUBLISHING" && s !== "SOLD" && s !== "REQUIRES_USER_ACTION";
}

function initialSelection(rows: PublishRow[]): Set<Marketplace> {
  return new Set(rows.filter((r) => r.isDefault && includable(r) && !r.publication).map((r) => r.marketplace));
}

function resumeJobs(rows: PublishRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) if (r.publication?.jobId && r.publication.status === "PUBLISHING" && r.publication.jobStatus && ACTIVE_JOB.has(r.publication.jobStatus)) out[r.marketplace] = r.publication.jobId;
  return out;
}

/**
 * The publish hub for one item: one row per marketplace (the seller's defaults first, the rest
 * under "More marketplaces"), a preview of exactly what each will receive, and one primary action.
 * Progress per row comes from the worker's event stream; assisted rows open the guided flow.
 */
export function PublishHub({ initial, returnTo }: { initial: PublishHubData; returnTo: string }) {
  const [hub, setHub] = useState(initial);
  const [selected, setSelected] = useState<Set<Marketplace>>(() => initialSelection(initial.rows));
  const [showMore, setShowMore] = useState(() => initial.rows.some((r) => !r.isDefault && r.publication));
  const [jobs, setJobs] = useState<Record<string, string>>(() => resumeJobs(initial.rows));
  const [sheetFor, setSheetFor] = useState<Marketplace | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [announce, setAnnounce] = useState("");

  const itemId = hub.item.id;
  const defaults = hub.rows.filter((r) => r.isDefault);
  const others = hub.rows.filter((r) => !r.isDefault);
  const liveCount = hub.rows.filter((r) => r.publication?.status === "PUBLISHED").length;
  const demo = hub.rows.some((r) => r.mode === "demo" && (r.publication || selected.has(r.marketplace)));

  const refresh = useCallback(async () => {
    try {
      setHub(await publishApi.hub(itemId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't refresh the publishing status.");
    }
  }, [itemId]);

  const patchRow = useCallback((marketplace: Marketplace, publication: PublicationDTO) => {
    setHub((h) => ({ ...h, rows: h.rows.map((r) => (r.marketplace === marketplace ? { ...r, publication } : r)) }));
  }, []);

  const onMutation = useCallback(
    (marketplace: Marketplace, result: PublicationMutation) => {
      patchRow(marketplace, result.publication);
      if (result.jobId) setJobs((j) => ({ ...j, [marketplace]: result.jobId! }));
      const attention = result.publication.attention?.code;
      if (!result.jobId && result.publication.status === "REQUIRES_USER_ACTION" && (attention === "end_listing" || attention === "update_price")) setSheetFor(marketplace);
    },
    [patchRow],
  );

  const onJobSettled = useCallback(
    (marketplace: Marketplace, outcome: JobOutcome) => {
      setJobs((j) => {
        const n = { ...j };
        delete n[marketplace];
        return n;
      });
      const name = hub.rows.find((r) => r.marketplace === marketplace)?.name ?? marketplace;
      setAnnounce(outcome === "succeeded" ? `${name} finished.` : `${name} stopped with a problem.`);
      void refresh();
    },
    [hub.rows, refresh],
  );

  const selectedRows = hub.rows.filter((r) => selected.has(r.marketplace) && includable(r));
  const count = selectedRows.length;

  const publish = async () => {
    if (count === 0) return;
    setPublishing(true);
    try {
      const { results } = await publishApi.start(itemId, selectedRows.map((r) => r.marketplace));
      const nextJobs: Record<string, string> = {};
      let firstAssisted: Marketplace | null = null;
      for (const r of results) {
        patchRow(r.marketplace, r.publication);
        if (r.jobId) nextJobs[r.marketplace] = r.jobId;
        else if (!firstAssisted && r.publication.status === "REQUIRES_USER_ACTION") firstAssisted = r.marketplace;
      }
      setJobs((j) => ({ ...j, ...nextJobs }));
      setSelected(new Set());
      const apiNames = results.filter((r) => r.jobId).map((r) => hub.rows.find((x) => x.marketplace === r.marketplace)?.shortName ?? r.marketplace);
      const assistedNames = results.filter((r) => !r.jobId).map((r) => hub.rows.find((x) => x.marketplace === r.marketplace)?.shortName ?? r.marketplace);
      setAnnounce([apiNames.length ? `Publishing to ${apiNames.join(", ")}.` : "", assistedNames.length ? `Checklist ready for ${assistedNames.join(", ")}.` : ""].join(" ").trim());
      if (apiNames.length) toast.success(`Publishing to ${apiNames.join(", ")}`, { description: "Each step below is live from the worker." });
      if (firstAssisted) setSheetFor(firstAssisted);
    } catch (err) {
      const detail = err instanceof RequestError && err.details && typeof err.details === "object" && "marketplace" in err.details ? String((err.details as { marketplace: string }).marketplace) : null;
      toast.error(err instanceof Error ? err.message : "Publishing didn't start. Nothing was posted.", { description: detail ? `Marketplace: ${detail}` : undefined });
      await refresh();
    } finally {
      setPublishing(false);
    }
  };

  const sheetRow = sheetFor ? hub.rows.find((r) => r.marketplace === sheetFor) ?? null : null;

  const renderRow = (row: PublishRow, index: number) => (
    <MarketplaceRow
      key={row.marketplace}
      row={row}
      itemId={itemId}
      returnTo={returnTo}
      index={index}
      selected={selected.has(row.marketplace)}
      onSelect={(checked) =>
        setSelected((s) => {
          const n = new Set(s);
          if (checked) n.add(row.marketplace);
          else n.delete(row.marketplace);
          return n;
        })
      }
      activeJobId={jobs[row.marketplace] ?? null}
      onJobSettled={(outcome) => onJobSettled(row.marketplace, outcome)}
      onOpenChecklist={() => setSheetFor(row.marketplace)}
      onMutation={(result) => onMutation(row.marketplace, result)}
    />
  );

  return (
    <div className="space-y-6">
      <ItemSummary hub={hub} liveCount={liveCount} demo={demo} />
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      <section aria-labelledby="defaults-heading" className="space-y-3">
        <h2 id="defaults-heading" className="text-sm font-medium text-secondary">
          Your marketplaces
        </h2>
        <ul className="space-y-3">{defaults.map(renderRow)}</ul>
      </section>

      {others.length > 0 && (
        <section aria-labelledby="more-heading" className="space-y-3">
          <button type="button" onClick={() => setShowMore((v) => !v)} aria-expanded={showMore} aria-controls="more-marketplaces" className="flex w-full items-center justify-between rounded-xs py-2 text-left text-sm font-medium text-secondary hover:text-primary">
            <span id="more-heading">More marketplaces ({others.length})</span>
            <ChevronDown className={cn("size-4 transition-transform duration-(--dur-base)", showMore && "rotate-180")} aria-hidden />
          </button>
          {showMore && (
            <ul id="more-marketplaces" className="space-y-3">
              {others.map((r, i) => renderRow(r, i))}
            </ul>
          )}
        </section>
      )}

      <div className="sticky bottom-[calc(var(--tabbar-h)+12px)] z-20 lg:bottom-4">
        <div className="surface-sheet flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-secondary">
            {count === 0 ? "Tick the marketplaces to publish to." : `${count} selected · assisted rows open a checklist; API rows publish now.`}
          </div>
          <Button size="lg" onClick={publish} disabled={count === 0} loading={publishing} leadingIcon={<Rocket className="size-4" aria-hidden />} className="sm:min-w-64">
            {count === 1 ? "Publish to 1 marketplace" : `Publish to ${count} marketplaces`}
          </Button>
        </div>
      </div>

      {sheetRow?.publication && (
        <AssistedSheet
          open={!!sheetFor}
          onOpenChange={(o) => !o && setSheetFor(null)}
          publication={sheetRow.publication}
          marketplaceName={sheetRow.name}
          marketplaceShortName={sheetRow.shortName}
          itemId={itemId}
          itemTitle={hub.item.title}
          disclosure={sheetRow.disclosure}
          rowNote={sheetRow.rowNote}
          onChanged={(publication) => patchRow(sheetRow.marketplace, publication)}
        />
      )}
    </div>
  );
}

function ItemSummary({ hub, liveCount, demo }: { hub: PublishHubData; liveCount: number; demo: boolean }) {
  const { item } = hub;
  const cover = item.cover;
  const summary = useMemo(() => {
    const parts = [`${item.photoCount} photo${item.photoCount === 1 ? "" : "s"}`];
    if (liveCount) parts.push(`live on ${liveCount} marketplace${liveCount === 1 ? "" : "s"}`);
    return parts.join(" · ");
  }, [item.photoCount, liveCount]);
  return (
    <div className="surface-card flex items-center gap-4 p-4">
      <div className="size-16 shrink-0 overflow-hidden rounded-xs bg-surface-sunken">
        {/* eslint-disable-next-line @next/next/no-img-element -- signed same-origin URL */}
        {cover ? <img src={cover.thumbUrl} alt={item.title} width={cover.width} height={cover.height} className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-xs text-muted">No photo</span>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="truncate text-base font-semibold text-primary">{item.title}</h2>
          {demo && <DemoBadge />}
        </div>
        <p className="mt-0.5 text-sm text-secondary">
          {item.listPrice ? (
            <>
              <Money cents={item.listPrice} className="font-medium text-primary" /> ·{" "}
            </>
          ) : (
            <span className="font-medium text-warning">No list price · </span>
          )}
          {summary} · <span className="tabular">{item.sku}</span>
        </p>
      </div>
      <Link href={`/items/${item.id}`} className="hidden shrink-0 items-center gap-1 text-sm font-medium text-accent-text hover:underline sm:inline-flex">
        <ArrowLeft className="size-4" aria-hidden /> Item
      </Link>
    </div>
  );
}
