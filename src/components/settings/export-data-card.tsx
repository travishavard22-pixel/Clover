"use client";
import { useEffect, useRef, useState } from "react";
import { Download, FileArchive } from "lucide-react";
import { toast } from "sonner";
import type { JobStep } from "@/lib/jobs/types";
import { Button } from "@/components/ui/button";
import { useJobEvents } from "@/hooks/use-job-events";
import { errorMessage } from "@/lib/client/request";
import { TimeAgo } from "@/lib/client/time-ago";
import { JobChecklist } from "./job-checklist";
import { settingsApi, type ExportStatus } from "./settings-api";

function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** "Export my data": a real job with a real checklist, then a signed link that lasts 24 hours. */
export function ExportDataCard({ initial }: { initial: ExportStatus }) {
  const [status, setStatus] = useState(initial);
  const [job, setJob] = useState<{ id: string; steps: JobStep[] } | null>(initial.job && (initial.job.status === "QUEUED" || initial.job.status === "RUNNING") ? { id: initial.job.id, steps: initial.job.steps as JobStep[] } : null);
  const [starting, setStarting] = useState(false);

  const start = async () => {
    setStarting(true);
    try {
      const r = await settingsApi.startExport();
      setJob({ id: r.jobId, steps: r.steps });
      if (r.reused) toast("An export is already running — showing it.");
    } catch (err) {
      toast.error(errorMessage(err, "Could not start the export."));
    } finally {
      setStarting(false);
    }
  };

  const refresh = async () => {
    try {
      setStatus(await settingsApi.exportStatus());
    } catch {
      // the link will appear on the next visit; the notification also carries it
    }
  };

  return (
    <div className="py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-medium text-primary">Export my data</div>
          <p className="mt-0.5 text-sm text-secondary">Everything you own as JSON plus every photo, in one ZIP under your private storage. Marketplace tokens and password hashes are never included.</p>
        </div>
        <Button variant="outline" onClick={start} loading={starting} disabled={!!job} leadingIcon={<FileArchive className="size-4" aria-hidden />} className="shrink-0">
          {status.download ? "Export again" : "Export my data"}
        </Button>
      </div>
      {job && (
        <ExportProgress
          key={job.id}
          jobId={job.id}
          steps={job.steps}
          onDone={(outcome, error) => {
            if (outcome === "succeeded") {
              toast.success("Your export is ready.", { description: "The download link works for 24 hours." });
              void refresh();
            } else toast.error("The export stopped early", { description: error ?? "Try again in a moment." });
            setJob(null);
          }}
        />
      )}
      {status.download && !job && (
        <div className="mt-3 flex flex-col gap-2 rounded-sm border border-border-subtle bg-surface-sunken p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            <div className="text-primary">
              Archive from <TimeAgo iso={status.download.createdAt} /> · <span className="tabular">{formatBytes(status.download.bytes)}</span>
            </div>
            <div className="text-xs text-secondary">
              {status.download.counts.items} items, {status.download.counts.photos} photos{status.download.counts.photosMissing ? ` (${status.download.counts.photosMissing} photo files were missing)` : ""}. Link expires <TimeAgo iso={status.download.expiresAt} mode="until" />.
            </div>
          </div>
          <a href={status.download.url} download className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-xs bg-accent px-3 text-sm font-medium text-on-accent hover:bg-accent-hover">
            <Download className="size-4" aria-hidden /> Download ZIP
          </a>
        </div>
      )}
      {status.job?.status === "FAILED" && !job && (
        <p className="mt-2 text-sm text-danger" role="alert">
          The last export failed{status.job.error ? `: ${status.job.error}` : ""}. Nothing was changed — try again.
        </p>
      )}
    </div>
  );
}

function ExportProgress({ jobId, steps, onDone }: { jobId: string; steps: JobStep[]; onDone: (outcome: "succeeded" | "failed", error: string | null) => void }) {
  const state = useJobEvents(jobId, { initialSteps: steps });
  const reported = useRef(false);
  useEffect(() => {
    if (state.outcome === "running" || reported.current) return;
    reported.current = true;
    onDone(state.outcome, state.error);
  }, [state.outcome, state.error, onDone]);
  return <JobChecklist state={state} doneText="Export finished." className="mt-3" />;
}
