import type { CSSProperties } from "react";

/**
 * The viewfinder is dark in both themes, like every camera. Rather than hard-coding colours, this
 * re-points the semantic tokens for the capture subtree at the dark ramp, so the same utilities
 * (`bg-surface-raised`, `text-secondary`, `bg-accent`…) render correctly inside it.
 */
export const darkScope: CSSProperties = {
  colorScheme: "dark",
  ["--surface-base" as string]: "oklch(0.13 0.008 120)",
  ["--surface-raised" as string]: "oklch(0.20 0.010 120)",
  ["--surface-overlay" as string]: "oklch(0.24 0.010 120)",
  ["--surface-floating" as string]: "oklch(0.27 0.010 120)",
  ["--surface-sunken" as string]: "oklch(0.16 0.010 120)",
  ["--surface-inverse" as string]: "var(--n-0)",
  ["--border-subtle" as string]: "oklch(0.26 0.010 120)",
  ["--border-default" as string]: "oklch(0.34 0.010 120)",
  ["--border-strong" as string]: "oklch(0.55 0.010 110)",
  ["--text-primary" as string]: "oklch(0.97 0.005 90)",
  ["--text-secondary" as string]: "oklch(0.80 0.008 90)",
  ["--text-muted" as string]: "oklch(0.66 0.008 90)",
  ["--text-inverse" as string]: "var(--n-11)",
  ["--text-on-accent" as string]: "oklch(0.13 0.02 152)",
  ["--accent" as string]: "var(--green-3)",
  ["--accent-hover" as string]: "oklch(0.78 0.12 148)",
  ["--accent-active" as string]: "oklch(0.84 0.12 148)",
  ["--accent-soft" as string]: "oklch(0.26 0.04 152)",
  ["--accent-soft-strong" as string]: "oklch(0.32 0.06 152)",
  ["--accent-text" as string]: "oklch(0.80 0.12 150)",
  ["--success" as string]: "oklch(0.75 0.13 150)",
  ["--success-soft" as string]: "oklch(0.26 0.05 150)",
  ["--warning" as string]: "oklch(0.80 0.14 80)",
  ["--warning-soft" as string]: "oklch(0.28 0.05 80)",
  ["--danger" as string]: "oklch(0.72 0.17 25)",
  ["--danger-soft" as string]: "oklch(0.28 0.06 27)",
  ["--info" as string]: "oklch(0.75 0.09 250)",
  ["--info-soft" as string]: "oklch(0.26 0.04 250)",
  ["--scrim" as string]: "oklch(0.10 0.01 120 / 0.6)",
  ["--focus-ring" as string]: "0 0 0 2px oklch(0.13 0.008 120), 0 0 0 4px var(--green-3)",
  ["--shadow-float" as string]: "0 1px 2px oklch(0 0 0 / 0.4), 0 8px 24px -8px oklch(0 0 0 / 0.6)",
  ["--shadow-lift" as string]: "0 2px 6px oklch(0 0 0 / 0.5), 0 20px 48px -16px oklch(0 0 0 / 0.7)",
};
