"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Images } from "lucide-react";
import { toast } from "sonner";
import { startAnalysis } from "@/components/capture/upload-client";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-classes";
import { DemoBadge } from "@/components/ui/badge";
import { useJobEvents } from "@/hooks/use-job-events";
import type { PhotoDTO } from "@/lib/items/dto";
import type { JobStep } from "@/lib/jobs/types";
import { cn } from "@/lib/utils/cn";
import { announcementFor, changedStepKeys, REVEAL_BEAT_MS, REVEAL_HOLD_MS, revealFromStepData, SLOW_AFTER_MS, summarizeSteps } from "./derive";
import { Reveal } from "./reveal";
import { SlowNotice } from "./slow-notice";
import { StepRow } from "./step-row";

type RevealPhase = "none" | "beat" | "shown";

/**
 * The signature analysis screen. Subscribes to the job's SSE stream and renders the checklist
 * with real step states. On completion: a 700 ms beat, then the item name and price reveal, then
 * navigation to the item. Failures show the step that failed with a retry that re-enqueues.
 */
export function AnalysisSequence({ itemId, jobId, initialSteps, initialStatus, cover, photoCount, itemTitle, demo }: { itemId: string; jobId: string; initialSteps: JobStep[]; initialStatus: string; cover: PhotoDTO | null; photoCount: number; itemTitle: string; demo: boolean }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const state = useJobEvents(jobId, { initialSteps, initialStatus });
  const summary = useMemo(() => summarizeSteps(state.steps), [state.steps]);
  const reveal = useMemo(() => revealFromStepData(state.stepData), [state.stepData]);
  const [revealPhase, setRevealPhase] = useState<RevealPhase>("none");
  const [announce, setAnnounce] = useState("");
  const [slow, setSlow] = useState(false);
  const [dismissedSlow, setDismissedSlow] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const prevSteps = useRef(state.steps);
  const mountedAt = useRef(Date.now());

  // Live-region announcements for step changes (one sentence per change, most recent wins).
  useEffect(() => {
    const changed = changedStepKeys(prevSteps.current, state.steps);
    prevSteps.current = state.steps;
    if (!changed.length) return;
    const last = state.steps.find((s) => s.key === changed[changed.length - 1]);
    if (last) {
      const text = announcementFor(last);
      if (text) setAnnounce(text);
    }
  }, [state.steps]);

  // Completion: beat → reveal → navigate.
  useEffect(() => {
    if (state.outcome !== "succeeded") return;
    setRevealPhase("beat");
    const t1 = setTimeout(() => setRevealPhase("shown"), REVEAL_BEAT_MS);
    const t2 = setTimeout(() => router.push(`/items/${itemId}`), REVEAL_BEAT_MS + REVEAL_HOLD_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [state.outcome, router, itemId]);

  useEffect(() => {
    if (revealPhase === "shown") setAnnounce(reveal.itemName ? `Analysis finished. It's a ${reveal.itemName}.` : "Analysis finished. Ready for review.");
  }, [revealPhase, reveal.itemName]);

  // "Taking longer than usual" after 90 s while still running.
  useEffect(() => {
    if (state.outcome !== "running") return;
    const elapsed = Date.now() - mountedAt.current;
    const t = setTimeout(() => setSlow(true), Math.max(0, SLOW_AFTER_MS - elapsed));
    return () => clearTimeout(t);
  }, [state.outcome]);

  const retry = async () => {
    setRetrying(true);
    try {
      const { jobId: next } = await startAnalysis(itemId);
      router.replace(`/items/${itemId}/analyzing?job=${encodeURIComponent(next)}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The analysis could not be restarted");
    } finally {
      setRetrying(false);
    }
  };

  const failed = state.outcome === "failed";
  const running = state.outcome === "running";
  const showSlow = slow && running && !dismissedSlow;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-14">
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announce}
      </div>

      {/* Cover */}
      <div className="lg:sticky lg:top-[calc(var(--topbar-h)+2rem)] lg:self-start">
        <div className={cn("relative overflow-hidden rounded-lg bg-surface-sunken", cover ? "aspect-[4/3] lg:aspect-square" : "aspect-[4/3]")}>
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed same-origin URL
            <img src={cover.url} alt={cover.label ? `Cover photo: ${cover.label}` : "Cover photo"} width={cover.width} height={cover.height} className={cn("size-full object-cover transition-[filter,opacity] duration-(--dur-slow)", running && "saturate-[0.92]")} />
          ) : (
            <div className="flex size-full items-center justify-center text-muted">
              <Images className="size-8" strokeWidth={1.5} aria-hidden />
            </div>
          )}
          {photoCount > 1 && <span className="absolute bottom-3 right-3 rounded-full bg-scrim px-2.5 py-1 text-xs font-medium tabular text-white">{photoCount} photos</span>}
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 text-sm">
          <Link href={`/sell/review/${itemId}`} className="text-secondary underline-offset-4 hover:text-primary hover:underline">
            Photos
          </Link>
          {demo && <DemoBadge />}
        </div>
      </div>

      {/* Checklist / reveal */}
      <div className="flex min-h-[60dvh] flex-col">
        <AnimatePresence mode="wait" initial={false}>
          {revealPhase === "shown" ? (
            <motion.div key="reveal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} className="flex flex-1 flex-col justify-center gap-8">
              <Reveal data={reveal} demo={demo} fallbackTitle={itemTitle} />
              <ol className="border-t border-border-subtle pt-3 text-sm text-muted" aria-label="Completed steps">
                {state.steps
                  .filter((s) => s.status === "done" && s.detail && s.detail !== s.label)
                  .slice(0, 4)
                  .map((s) => (
                    <li key={s.key} className="py-1">
                      {s.detail}
                    </li>
                  ))}
              </ol>
              <div>
                <Link href={`/items/${itemId}`} className={buttonClasses("primary", "lg")}>
                  Review the listing <ArrowRight className="size-5" aria-hidden />
                </Link>
                <p className="mt-2 text-xs text-muted">Taking you there in a moment.</p>
              </div>
            </motion.div>
          ) : (
            <motion.div key="steps" initial={false} exit={{ opacity: 0, y: reduce ? 0 : -6 }} transition={{ duration: 0.2 }} className="flex flex-1 flex-col">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <h2 className="text-xs font-medium uppercase tracking-wide text-muted">
                  {failed ? "Stopped" : revealPhase === "beat" ? "Finished" : "In progress"}
                </h2>
                <span className="text-xs tabular text-muted" aria-hidden>
                  {summary.done} / {summary.total}
                </span>
              </div>
              <ol className="divide-y divide-border-subtle" aria-label="Analysis steps">
                {state.steps.map((s, i) => (
                  <StepRow key={s.key} step={s} index={i} onRetry={s.status === "failed" ? () => void retry() : undefined} retrying={retrying} />
                ))}
              </ol>

              <div className="mt-auto flex flex-col gap-3 pt-6">
                {failed && (
                  <div role="alert" className="flex flex-col gap-3 rounded-sm border border-danger/30 bg-danger-soft p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium text-primary">The analysis stopped.</p>
                      <p className="mt-0.5 text-secondary">{state.error ?? "No details were reported."} Your photos are safe.</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Link href={`/sell/review/${itemId}`} className={buttonClasses("ghost", "sm")}>
                        Back to photos
                      </Link>
                      <Button size="sm" onClick={() => void retry()} loading={retrying}>
                        Retry
                      </Button>
                    </div>
                  </div>
                )}
                {showSlow && <SlowNotice onKeepWaiting={() => setDismissedSlow(true)} connection={state.connection} />}
                {running && state.connection === "reconnecting" && !showSlow && (
                  <p className="text-xs text-secondary" role="status">
                    Connection dropped — reconnecting and catching up on anything missed.
                  </p>
                )}
                {running && (
                  <p className="text-xs text-muted">
                    Each line reflects a real step of the job. {summary.running?.detail ? "" : "Details appear as the worker reports them."} You can leave; the job keeps running.
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
