import { cn } from "@/lib/utils/cn";
import type { ConfidenceTier } from "@/lib/db";

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info" | "inverse";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-surface-sunken text-secondary border-border-subtle",
  accent: "bg-accent-soft text-accent-text border-transparent",
  success: "bg-success-soft text-success border-transparent",
  warning: "bg-warning-soft text-warning border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
  info: "bg-info-soft text-info border-transparent",
  inverse: "bg-surface-inverse text-inverse border-transparent",
};

export function Badge({ tone = "neutral", className, children, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs font-medium", tones[tone], className)} {...props}>
      {children}
    </span>
  );
}

const confidenceMeta: Record<ConfidenceTier, { label: string; tone: BadgeTone; dot: string }> = {
  CONFIDENT: { label: "Confident", tone: "success", dot: "bg-success" },
  LIKELY: { label: "Likely", tone: "info", dot: "bg-info" },
  NEEDS_CHECK: { label: "Needs check", tone: "warning", dot: "bg-warning" },
};

/** Plain-language confidence tier. Numeric score is exposed only in expert mode via `score`. */
export function ConfidenceBadge({ tier, score, expert, className }: { tier: ConfidenceTier; score?: number; expert?: boolean; className?: string }) {
  const m = confidenceMeta[tier];
  return (
    <Badge tone={m.tone} className={className} aria-label={`Confidence: ${m.label}${expert && score !== undefined ? ` (${Math.round(score * 100)}%)` : ""}`}>
      <span className={cn("size-1.5 rounded-full", m.dot)} aria-hidden />
      {m.label}
      {expert && score !== undefined && <span className="tabular text-[10px] opacity-80">{Math.round(score * 100)}%</span>}
    </Badge>
  );
}

export function tierFromScore(score: number): ConfidenceTier {
  if (score >= 0.85) return "CONFIDENT";
  if (score >= 0.6) return "LIKELY";
  return "NEEDS_CHECK";
}

export function AiBadge({ className, label = "AI estimate" }: { className?: string; label?: string }) {
  return (
    <Badge tone="info" className={className}>
      {label}
    </Badge>
  );
}

export function DemoBadge({ className }: { className?: string }) {
  return (
    <Badge tone="warning" className={className} title="Running with demo providers — no real marketplace or AI calls are made.">
      Demo data
    </Badge>
  );
}
