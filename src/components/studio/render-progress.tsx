"use client";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Circle, Loader2, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { JobStep } from "@/lib/jobs/types";
import { cn } from "@/lib/utils/cn";
import { useJobEvents } from "@/hooks/use-job-events";

const SLOW_AFTER_MS = 20_000;

/**
 * The real step checklist for a STUDIO_RENDER job, driven by the job's SSE stream. Skipped steps
 * show why they were skipped (e.g. "No segmentation provider configured — enhancing instead").
 */
export function RenderProgress({ jobId, initialSteps, onDone, onRetry }: { jobId: string; initialSteps: JobStep[]; onDone: (result: { outcome: "succeeded" | "failed"; error: string | null; photoId: string | null }) => void; onRetry: () => void }) {
  const state = useJobEvents(jobId, { initialSteps });
  const reported = useRef<string | null>(null);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (state.outcome === "running" || reported.current === jobId) return;
    reported.current = jobId;
    const photoId = typeof state.stepData.save?.photoId === "string" ? (state.stepData.save.photoId as string) : null;
    onDone({ outcome: state.outcome, error: state.error, photoId });
  }, [state.outcome, state.error, state.stepData, jobId, onDone]);

  useEffect(() => {
    if (state.outcome !== "running") return;
    const t = setInterval(() => setSlow(!!state.lastEventAt && Date.now() - state.lastEventAt > SLOW_AFTER_MS), 2000);
    return () => clearInterval(t);
  }, [state.lastEventAt, state.outcome]);

  const running = state.steps.find((s) => s.status === "running");
  const live = state.outcome === "succeeded" ? "Studio photo saved." : state.outcome === "failed" ? `Stopped: ${state.error ?? "the render failed."}` : running ? `${running.label}${running.detail ? ` — ${running.detail}` : ""}` : state.connection === "connecting" ? "Connecting…" : "Queued";

  return (
    <div className="rounded-sm border border-border-subtle bg-surface-raised p-3" aria-busy={state.outcome === "running" || undefined}>
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
      {state.outcome === "running" && (state.connection === "reconnecting" || slow) && (
        <p className="mt-2 text-xs text-muted">{state.connection === "reconnecting" ? "Reconnecting to the job…" : "Taking longer than usual. The job keeps running even if you leave this page."}</p>
      )}
      {state.outcome === "failed" && (
        <div className="mt-3 flex items-start justify-between gap-3 rounded-xs bg-danger-soft p-2 text-sm text-danger" role="alert">
          <span className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{state.error ?? "The render failed."} Your originals are untouched.</span>
          </span>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
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
