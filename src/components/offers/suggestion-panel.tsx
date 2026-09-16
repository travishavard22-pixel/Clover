"use client";
import { Check, Copy, Lightbulb } from "lucide-react";
import { AiBadge, Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { useCopy } from "@/components/marketplaces/use-copy";
import type { OfferSuggestion } from "@/lib/offers";

const LABEL: Record<OfferSuggestion["recommendation"], string> = { accept: "Accept", counter: "Counter", decline: "Decline" };

/**
 * The suggestion for an offer: recommendation, reasoning grounded in the numbers, and a reply the
 * seller can copy. The source is always stated — AI provider or deterministic rules — and it is
 * called a suggestion, never a decision.
 */
export function SuggestionPanel({ suggestion, loading, error, onRetry, onUseCounter }: { suggestion: OfferSuggestion | null; loading: boolean; error: string | null; onRetry: () => void; onUseCounter?: (cents: number, message: string) => void }) {
  const { state, copy } = useCopy();
  if (loading) {
    return (
      <div className="rounded-sm border border-border-subtle bg-surface-sunken px-4 py-3 text-sm text-secondary" aria-live="polite" aria-busy>
        Working out a suggestion from the numbers…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-danger/40 bg-danger-soft px-4 py-3 text-sm">
        <span className="text-primary">{error}</span>
        <Button size="sm" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }
  if (!suggestion) return null;
  return (
    <div className="space-y-3 rounded-sm border border-border-subtle bg-surface-sunken px-4 py-3" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <Lightbulb className="size-4 text-accent-text" aria-hidden />
        <span className="text-sm font-semibold text-primary">
          Suggestion: {LABEL[suggestion.recommendation]}
          {suggestion.recommendation === "counter" && suggestion.counterAmountCents ? (
            <>
              {" "}
              at <Money cents={suggestion.counterAmountCents} />
            </>
          ) : null}
        </span>
        {suggestion.source === "ai" ? <AiBadge label={`AI suggestion · ${suggestion.provider}`} /> : <Badge tone="neutral">Rule-based</Badge>}
      </div>
      <p className="text-sm leading-relaxed text-secondary">{suggestion.reasoning}</p>
      {suggestion.suggestedMessage && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Draft reply</p>
          <blockquote className="rounded-xs border-l-2 border-border-strong bg-surface-raised px-3 py-2 text-sm text-primary">{suggestion.suggestedMessage}</blockquote>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => copy(suggestion.suggestedMessage)} leadingIcon={state === "copied" ? <Check className="size-4 text-success" aria-hidden /> : <Copy className="size-4" aria-hidden />}>
              {state === "copied" ? "Copied" : "Copy reply"}
            </Button>
            {suggestion.recommendation === "counter" && suggestion.counterAmountCents && onUseCounter && (
              <Button size="sm" variant="ghost" onClick={() => onUseCounter(suggestion.counterAmountCents!, suggestion.suggestedMessage)}>
                Use this counter
              </Button>
            )}
          </div>
        </div>
      )}
      <p className="text-xs text-muted">
        Based on a {Math.round(suggestion.inputs.feeRate * 100)}% fee estimate and {suggestion.inputs.daysListed} day{suggestion.inputs.daysListed === 1 ? "" : "s"} listed. A suggestion, not a decision — you choose.
      </p>
    </div>
  );
}
