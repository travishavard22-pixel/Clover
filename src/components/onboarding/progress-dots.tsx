"use client";
import { cn } from "@/lib/utils/cn";

export function ProgressDots({ count, current, onJump, labels }: { count: number; current: number; onJump: (i: number) => void; labels: readonly string[] }) {
  return (
    <ol className="flex items-center justify-center gap-2" aria-label={`Step ${current + 1} of ${count}: ${labels[current]}`}>
      {Array.from({ length: count }).map((_, i) => (
        <li key={i}>
          <button
            type="button"
            aria-label={`${labels[i]}${i === current ? " (current)" : i < current ? " (done)" : ""}`}
            aria-current={i === current ? "step" : undefined}
            onClick={() => onJump(i)}
            className="flex size-6 items-center justify-center rounded-full"
          >
            <span className={cn("block rounded-full transition-all duration-(--dur-base) ease-(--ease-out)", i === current ? "h-2 w-5 bg-accent" : i < current ? "size-2 bg-accent/50" : "size-2 bg-border-strong")} />
          </button>
        </li>
      ))}
    </ol>
  );
}
