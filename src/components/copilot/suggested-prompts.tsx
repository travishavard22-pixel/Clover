"use client";
import { SUGGESTED_PROMPTS } from "@/lib/copilot/prompts";
import { cn } from "@/lib/utils/cn";

export function SuggestedPrompts({ onPick, disabled, className, compact }: { onPick: (prompt: string) => void; disabled?: boolean; className?: string; compact?: boolean }) {
  return (
    <ul className={cn("flex flex-wrap gap-2", compact ? "justify-start" : "justify-center", className)} aria-label="Suggested questions">
      {SUGGESTED_PROMPTS.map((p) => (
        <li key={p}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onPick(p)}
            className="touch-target rounded-full border border-border-default bg-surface-raised px-3.5 py-2 text-sm text-primary transition-colors hover:border-border-strong hover:bg-surface-sunken disabled:opacity-50 sm:min-h-0 sm:min-w-0"
          >
            {p}
          </button>
        </li>
      ))}
    </ul>
  );
}
