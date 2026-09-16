"use client";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Plug, RefreshCw, Unplug } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-classes";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { post } from "@/components/marketplaces/api-client";
import { relativeTime } from "@/components/marketplaces/format";
import { ModeBadge } from "@/components/marketplaces/mode-badge";
import { MonogramTile } from "@/components/marketplaces/monogram-tile";
import { PublishProgress } from "@/components/publish/publish-progress";
import type { ConnectionRow } from "@/lib/marketplaces";
import { cn } from "@/lib/utils/cn";
import { PermissionsDialog } from "./permissions-dialog";

export type ConnectionCardProps = { row: ConnectionRow; returnTo: string | null; onChanged: (row: ConnectionRow) => void; onSynced: () => void; index: number };

/**
 * One marketplace: how it works (API / Assisted / Demo, with the reason), whether it is connected
 * and as whom, what was granted, when it last synced, and the actions that fit its state.
 */
export function ConnectionCard({ row, returnTo, onChanged, onSynced, index }: ConnectionCardProps) {
  const reduce = useReducedMotion();
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [busy, setBusy] = useState<"disconnect" | "sync" | null>(null);
  const [syncJob, setSyncJob] = useState<string | null>(null);
  const mp = row.marketplace.toLowerCase();
  const connectHref = `/api/marketplaces/${mp}/connect${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`;
  const connected = row.status === "CONNECTED";
  const syncable = connected && (row.capabilities.offers === "api" || row.capabilities.orders === "api");

  const disconnect = async () => {
    setBusy("disconnect");
    try {
      const res = await post<{ connection: ConnectionRow }>(`/api/marketplaces/${mp}/disconnect`);
      onChanged({ ...res.connection, isDefault: row.isDefault, livePublications: row.livePublications });
      setConfirmDisconnect(false);
      toast.success(`${row.name} disconnected`, { description: "Stored tokens were deleted. Your listings stay recorded." });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't disconnect. Nothing was changed.");
    } finally {
      setBusy(null);
    }
  };

  const sync = async () => {
    setBusy("sync");
    try {
      const res = await post<{ jobId: string }>(`/api/marketplaces/${mp}/sync`);
      setSyncJob(res.jobId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't start the sync.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1], delay: reduce ? 0 : Math.min(index, 6) * 0.04 }}
      className={cn("surface-card flex flex-col gap-4 p-4 sm:p-5", row.status === "NEEDS_REAUTH" || row.status === "ERROR" ? "border-warning/50" : undefined)}
      aria-labelledby={`conn-${row.marketplace}`}
    >
      <div className="flex items-start gap-3">
        <MonogramTile shortName={row.shortName} name={row.name} color={row.color} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 id={`conn-${row.marketplace}`} className="text-base font-semibold text-primary">
              {row.name}
            </h2>
            <ModeBadge mode={row.mode} explanation={row.modeExplanation} marketplaceName={row.name} />
            {row.mode === "demo" && connected && <Badge tone="warning">Demo connection</Badge>}
            {row.isDefault && <Badge tone="neutral">Default</Badge>}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-secondary">{row.modeExplanation}</p>
          {row.note && (
            <p className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-secondary">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
              {row.note}
            </p>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted">Status</dt>
          <dd className="mt-0.5 flex items-center gap-1.5 font-medium text-primary">
            <StatusIcon status={row.status} connectable={row.connectable} />
            {statusText(row)}
          </dd>
        </div>
        {row.connectable && (
          <div className="min-w-0">
            <dt className="text-xs text-muted">Account</dt>
            <dd className="mt-0.5 truncate text-primary">{row.accountName ?? "—"}</dd>
          </div>
        )}
        <div>
          <dt className="text-xs text-muted">{row.connectable ? "Last sync" : "Live listings"}</dt>
          <dd className="mt-0.5 text-primary tabular">{row.connectable ? (connected ? relativeTime(row.lastSyncAt) : "—") : row.livePublications}</dd>
        </div>
        {row.connectable && (
          <div>
            <dt className="text-xs text-muted">Live listings</dt>
            <dd className="mt-0.5 text-primary tabular">{row.livePublications}</dd>
          </div>
        )}
      </dl>

      {row.lastError && (
        <p role="status" className="rounded-xs border border-danger/40 bg-danger-soft px-3 py-2 text-xs text-primary">
          Last error: {row.lastError}
        </p>
      )}

      {syncJob && (
        <div className="rounded-xs bg-surface-sunken px-3 py-2">
          <PublishProgress
            jobId={syncJob}
            compact
            onSettled={(outcome) => {
              setSyncJob(null);
              onSynced();
              if (outcome === "succeeded") toast.success(`${row.name} synced`);
              else toast.error(`${row.name} sync stopped with a problem`, { description: "The card shows the last error." });
            }}
          />
        </div>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2">
        {row.connectable ? (
          <>
            {!connected && (
              <a href={connectHref} className={buttonClasses("primary", "sm")}>
                <Plug className="size-4" aria-hidden />
                {row.status === "NEEDS_REAUTH" ? `Reauthorize ${row.shortName}` : row.status === "ERROR" ? `Reconnect ${row.shortName}` : `Connect ${row.shortName}`}
              </a>
            )}
            {connected && syncable && (
              <Button size="sm" variant="outline" onClick={sync} loading={busy === "sync"} disabled={!!syncJob} leadingIcon={<RefreshCw className="size-4" aria-hidden />}>
                Sync now
              </Button>
            )}
            {connected && (
              <a href={connectHref} className={buttonClasses("ghost", "sm")}>
                Reconnect
              </a>
            )}
            {connected && (
              <Button size="sm" variant="ghost" onClick={() => setConfirmDisconnect(true)} leadingIcon={<Unplug className="size-4" aria-hidden />}>
                Disconnect
              </Button>
            )}
            <PermissionsDialog marketplaceName={row.name} scopes={row.scopes} connected={connected} />
          </>
        ) : (
          row.createUrl && (
            <a href={row.createUrl} target="_blank" rel="noopener noreferrer" className={buttonClasses("outline", "sm")}>
              <ExternalLink className="size-4" aria-hidden />
              Open {row.shortName}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          )
        )}
      </div>

      <Dialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
        <DialogContent size="sm" title={`Disconnect ${row.name}?`} description={`Clover deletes the stored tokens and account link${row.accountName ? ` for ${row.accountName}` : ""}. ${row.livePublications > 0 ? `Your ${row.livePublications} live listing${row.livePublications === 1 ? "" : "s"} stay up on ${row.name} but Clover can no longer update or end them until you reconnect.` : "Nothing on the marketplace changes."}`}>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setConfirmDisconnect(false)}>
              Keep connected
            </Button>
            <Button variant="danger" onClick={disconnect} loading={busy === "disconnect"}>
              Disconnect
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.li>
  );
}

function statusText(row: ConnectionRow): string {
  if (!row.connectable) return "No account link needed";
  switch (row.status) {
    case "CONNECTED":
      return row.mode === "demo" ? "Connected (demo)" : "Connected";
    case "NEEDS_REAUTH":
      return "Authorization expired";
    case "ERROR":
      return "Connection error";
    default:
      return "Not connected";
  }
}

function StatusIcon({ status, connectable }: { status: ConnectionRow["status"]; connectable: boolean }) {
  if (!connectable) return <CheckCircle2 className="size-4 text-info" aria-hidden />;
  if (status === "CONNECTED") return <CheckCircle2 className="size-4 text-success" aria-hidden />;
  if (status === "NOT_CONNECTED") return <Plug className="size-4 text-muted" aria-hidden />;
  return <AlertTriangle className="size-4 text-warning" aria-hidden />;
}
