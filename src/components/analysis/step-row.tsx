"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertCircle, Check, Minus } from "lucide-react";
import type { JobStepView } from "@/hooks/use-job-events";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { statusWord } from "./derive";

/**
 * One line of the analysis checklist. State is real: pending (muted), running (accent dot + live
 * detail from `step_progress`), done (tick + final detail), failed (danger + message + retry),
 * skipped (muted + reason). Colour meaning is always duplicated by the icon and a status word.
 */
export function StepRow({ step, index, onRetry, retrying }: { step: JobStepView; index: number; onRetry?: () => void; retrying?: boolean }) {
  const reduce = useReducedMotion();
  const running = step.status === "running";
  const done = step.status === "done";
  const failed = step.status === "failed";
  const skipped = step.status === "skipped";
  const pending = step.status === "pending";
  const detail = step.detail && step.detail !== step.label ? step.detail : null;

  return (
    <motion.li
      layout={reduce ? false : "position"}
      initial={false}
      className={cn("flex gap-4 py-3 transition-colors duration-(--dur-base)", pending && "text-muted", skipped && "text-muted", failed && "text-primary")}
      aria-current={running ? "step" : undefined}
    >
      <span className="relative mt-0.5 flex size-5 shrink-0 items-center justify-center" aria-hidden>
        {pending && <span className="size-2 rounded-full border border-border-strong" />}
        {running && (
          <>
            <span className="size-2.5 rounded-full bg-accent" />
            {!reduce && <motion.span className="absolute inset-0 rounded-full border border-accent" initial={{ opacity: 0.6, scale: 0.55 }} animate={{ opacity: 0, scale: 1.3 }} transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }} />}
          </>
        )}
        {done && <Check className="size-4 text-success" strokeWidth={2.5} />}
        {failed && <AlertCircle className="size-4 text-danger" />}
        {skipped && <Minus className="size-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className={cn("text-base leading-tight", (running || done) && "text-primary", running && "font-medium")}>
            <span className="sr-only">Step {index + 1}: </span>
            {step.label}
          </span>
          <span className={cn("shrink-0 text-xs", running ? "text-accent-text" : done ? "text-success" : failed ? "text-danger" : "text-muted")}>{statusWord(step.status)}</span>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          {(detail || failed) && (
            <motion.p
              key={`${step.status}:${detail ?? ""}`}
              initial={{ opacity: 0, y: reduce ? 0 : 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
              className={cn("mt-0.5 text-sm leading-snug", failed ? "text-danger" : running ? "text-secondary" : "text-muted")}
            >
              {detail ?? "Something went wrong in this step."}
            </motion.p>
          )}
        </AnimatePresence>
        {failed && onRetry && (
          <div className="mt-2">
            <Button size="sm" variant="outline" onClick={onRetry} loading={retrying}>
              Retry the analysis
            </Button>
          </div>
        )}
      </div>
    </motion.li>
  );
}
