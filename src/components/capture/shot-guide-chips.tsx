"use client";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { SHOT_GUIDE } from "./shot-guide";

/**
 * The guided sequence as a row of chips with the current hint underneath. Purely advisory: the
 * seller can shoot in any order and take more than four; chips only reflect how many exist.
 */
export function ShotGuideChips({ taken, retakeIndex, className }: { taken: number; retakeIndex: number | null; className?: string }) {
  const current = retakeIndex ?? taken;
  const step = SHOT_GUIDE[current] ?? null;
  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <ol className="flex items-center gap-1.5" aria-label="Suggested shots">
        {SHOT_GUIDE.map((s, i) => {
          const done = retakeIndex === null ? i < taken : i < taken && i !== retakeIndex;
          const active = i === current;
          return (
            <li
              key={s.label}
              aria-current={active ? "step" : undefined}
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition-colors duration-(--dur-fast)",
                done ? "bg-white/15 text-white/80" : active ? "bg-white text-[oklch(0.17_0.01_120)]" : "bg-white/10 text-white/60",
              )}
            >
              {done && <Check className="size-3" aria-hidden />}
              {s.label}
              {done && <span className="sr-only"> (taken)</span>}
            </li>
          );
        })}
        {taken > SHOT_GUIDE.length && <li className="inline-flex h-7 items-center rounded-full bg-white/15 px-2.5 text-xs font-medium tabular text-white/80">+{taken - SHOT_GUIDE.length}</li>}
      </ol>
      <p className="min-h-5 text-center text-sm text-white/85 scrim-text" aria-live="polite">
        {retakeIndex !== null ? `Retaking photo ${retakeIndex + 1}${step ? ` — ${step.hint}` : ""}` : step ? step.hint : taken >= SHOT_GUIDE.length ? "Add any other angle that helps a buyer, or tap Done." : ""}
      </p>
    </div>
  );
}
