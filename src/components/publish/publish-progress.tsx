"use client";
import { useEffect, useRef } from "react";
import { Check, Loader2, Minus, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useJobEvents, type JobOutcome } from "@/hooks/use-job-events";
import type { JobStep } from "@/lib/jobs/types";
import { cn } from "@/lib/utils/cn";

/**
 * Live progress for one PUBLISH (or end/reprice) job, straight from the worker's SSE stream.
 * Every line is a real step; nothing here is timed or simulated. Calls `onSettled` once when the
 * job ends so the row can reload its publication.
 */
export function PublishProgress({ jobId, initialSteps, initialStatus, onSettled, compact }: { jobId: string; initialSteps?: JobStep[]; initialStatus?: string | null; onSettled?: (outcome: JobOutcome) => void; compact?: boolean }) {
  const state = useJobEvents(jobId, { initialSteps, initialStatus });
  const reduce = useReducedMotion();
  const settled = useRef(false);
  useEffect(() => {
    if (state.outcome === "running" || settled.current) return;
    settled.current = true;
    onSettled?.(state.outcome);
  }, [state.outcome, onSettled]);

  const visible = state.steps.filter((s) => s.status !== "pending" || !compact);
  return (
    <div className="space-y-1.5" aria-live="polite" aria-busy={state.outcome === "running"}>
      {state.connection === "reconnecting" && <p className="text-xs text-warning">Reconnecting to progress…</p>}
      <ol className="space-y-1">
        <AnimatePresence initial={false}>
          {visible.map((s, i) => (
            <motion.li
              key={s.key}
              initial={reduce ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1], delay: reduce ? 0 : i * 0.03 }}
              className={cn("flex items-start gap-2 text-xs", s.status === "pending" && "text-muted", s.status === "running" && "text-primary", s.status === "done" && "text-secondary", s.status === "failed" && "text-danger", s.status === "skipped" && "text-muted")}
            >
              <StepIcon status={s.status} />
              <div className="min-w-0">
                <span className={cn(s.status === "running" && "font-medium")}>{s.label}</span>
                {s.detail && s.status !== "pending" && <span className="block truncate text-muted" title={s.detail}>{s.detail}</span>}
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
      {state.outcome === "failed" && state.error && <p className="text-xs text-danger">{state.error}</p>}
    </div>
  );
}

function StepIcon({ status }: { status: JobStep["status"] }) {
  const cls = "mt-0.5 size-3.5 shrink-0";
  switch (status) {
    case "running":
      return <Loader2 className={cn(cls, "animate-spin text-accent-text")} aria-label="In progress" />;
    case "done":
      return <Check className={cn(cls, "text-success")} aria-label="Done" strokeWidth={2.5} />;
    case "failed":
      return <X className={cn(cls, "text-danger")} aria-label="Failed" />;
    case "skipped":
      return <Minus className={cls} aria-label="Skipped" />;
    default:
      return <span className={cn(cls, "flex items-center justify-center")} aria-label="Pending"><span className="size-1.5 rounded-full bg-border-strong" /></span>;
  }
}
