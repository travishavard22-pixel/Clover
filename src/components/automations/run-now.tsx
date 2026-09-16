"use client";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Circle, Loader2, Minus, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { JobStep } from "@/lib/jobs/types";
import { useJobEvents } from "@/hooks/use-job-events";
import { errorMessage } from "@/lib/client/request";
import { TimeAgo } from "@/lib/client/time-ago";
import { cn } from "@/lib/utils/cn";
import { automationsApi, type LastRun } from "./automations-api";

type RunSummaryData = { created?: number; autoApplied?: number; autoFailed?: number; notified?: number; resolved?: number };

function summarise(d: RunSummaryData): string {
  const parts: string[] = [];
  const n = (v: unknown) => (typeof v === "number" ? v : 0);
  parts.push(`${n(d.created)} new recommendation${n(d.created) === 1 ? "" : "s"}`);
  if (n(d.autoApplied)) parts.push(`${n(d.autoApplied)} applied automatically`);
  if (n(d.autoFailed)) parts.push(`${n(d.autoFailed)} could not be applied`);
  if (n(d.notified)) parts.push(`${n(d.notified)} notification${n(d.notified) === 1 ? "" : "s"}`);
  if (n(d.resolved)) parts.push(`${n(d.resolved)} outdated cleared`);
  return parts.join(", ");
}

/** "Run now": enqueues the job and shows the real step checklist from the job's event stream. */
export function RunNow({ lastRun, onFinished }: { lastRun: LastRun; onFinished: () => void }) {
  const [job, setJob] = useState<{ id: string; steps: JobStep[] } | null>(null);
  const [starting, setStarting] = useState(false);

  const start = async () => {
    setStarting(true);
    try {
      const r = await automationsApi.run();
      setJob({ id: r.jobId, steps: r.steps });
      if (r.reused) toast("A run is already in progress — showing it.");
    } catch (err) {
      toast.error(errorMessage(err, "Could not start the run."));
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="flex flex-col items-stretch gap-3 sm:items-end">
      <div className="flex items-center gap-3">
        {lastRun && !job && (
          <span className="text-xs text-muted">
            Last run <TimeAgo iso={lastRun.finishedAt ?? lastRun.createdAt} />
            {lastRun.status === "FAILED" ? " (failed)" : ""}
          </span>
        )}
        <Button onClick={start} loading={starting} disabled={!!job} leadingIcon={<Play className="size-4" aria-hidden />}>
          Run now
        </Button>
      </div>
      {job && (
        <RunProgress
          key={job.id}
          jobId={job.id}
          initialSteps={job.steps}
          onDone={(outcome, summary, error) => {
            if (outcome === "succeeded") toast.success("Automations finished", { description: summary ?? "Your inventory was checked." });
            else toast.error("The run stopped early", { description: error ?? "Try again in a moment." });
            onFinished();
            window.setTimeout(() => setJob(null), 4000);
          }}
        />
      )}
    </div>
  );
}

function RunProgress({ jobId, initialSteps, onDone }: { jobId: string; initialSteps: JobStep[]; onDone: (outcome: "succeeded" | "failed", summary: string | null, error: string | null) => void }) {
  const state = useJobEvents(jobId, { initialSteps });
  const reported = useRef(false);
  useEffect(() => {
    if (state.outcome === "running" || reported.current) return;
    reported.current = true;
    const act = state.stepData.act as RunSummaryData | undefined;
    onDone(state.outcome, act ? summarise(act) : null, state.error);
  }, [state.outcome, state.stepData, state.error, onDone]);

  const running = state.steps.find((s) => s.status === "running");
  const live = state.outcome === "succeeded" ? "Run finished." : state.outcome === "failed" ? `Stopped: ${state.error ?? "the run failed."}` : running ? `${running.label}${running.detail ? ` — ${running.detail}` : ""}` : state.connection === "connecting" ? "Connecting…" : "Waiting for a worker";

  return (
    <div className="w-full rounded-sm border border-border-subtle bg-surface-raised p-3 text-left sm:w-96" aria-busy={state.outcome === "running" || undefined}>
      <p className="sr-only" aria-live="polite">
        {live}
      </p>
      <ol className="space-y-1.5">
        {state.steps.map((s) => (
          <li key={s.key} className="flex items-start gap-2 text-sm">
            <StepIcon status={s.status} />
            <div className="min-w-0 flex-1">
              <div className={cn("leading-5", s.status === "pending" ? "text-muted" : "text-primary", s.status === "failed" && "text-danger")}>{s.label}</div>
              {s.detail && <div className={cn("text-xs", s.status === "failed" ? "text-danger" : "text-secondary")}>{s.detail}</div>}
            </div>
          </li>
        ))}
      </ol>
      {state.outcome === "running" && !running && state.connection !== "connecting" && <p className="mt-2 text-xs text-muted">Queued. A worker picks it up within a few seconds.</p>}
      {state.connection === "reconnecting" && state.outcome === "running" && <p className="mt-2 text-xs text-muted">Reconnecting to the job…</p>}
      {state.outcome === "failed" && (
        <p className="mt-2 flex items-start gap-2 text-sm text-danger" role="alert">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.error ?? "The run failed."} Nothing was changed.
        </p>
      )}
    </div>
  );
}

function StepIcon({ status }: { status: JobStep["status"] }) {
  const cls = "mt-0.5 size-4 shrink-0";
  switch (status) {
    case "done":
      return <Check className={cn(cls, "text-success")} aria-label="Done" />;
    case "running":
      return <Loader2 className={cn(cls, "animate-spin text-accent")} aria-label="Running" />;
    case "failed":
      return <AlertCircle className={cn(cls, "text-danger")} aria-label="Failed" />;
    case "skipped":
      return <Minus className={cn(cls, "text-muted")} aria-label="Skipped" />;
    default:
      return <Circle className={cn(cls, "text-border-strong")} aria-label="Pending" />;
  }
}
