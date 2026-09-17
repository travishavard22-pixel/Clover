import { CLOVER_LEAF_ANGLES, CLOVER_LEAF_PATH, CLOVER_LUCKY_LEAF, cloverLeafTransform } from "./clover";
import { cn } from "@/lib/utils/cn";

/**
 * The clover mark: four heart leaves meeting at the centre, the top one lighter — the lucky leaf.
 *
 * Single colour on purpose. This mark appears in the top bar, the wordmark, the auth pages and on
 * inverted surfaces, so it takes its colour from `currentColor` and expresses the lucky leaf as
 * reduced opacity rather than a second fill. That keeps one drawing working in green on cream,
 * cream on green, and anywhere else, where a hardcoded second colour would only work in one.
 *
 * Below 20px the lucky leaf goes solid: a 55%-opacity lobe a few pixels across stops reading as a
 * lighter leaf and starts reading as a rendering artefact.
 */
export function CloverMark({ className, size = 24 }: { className?: string; size?: number }) {
  const distinguishLucky = size >= 20;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="currentColor" aria-hidden="true" className={cn("shrink-0", className)}>
      {CLOVER_LEAF_ANGLES.map((angle, i) => (
        <path
          key={angle}
          d={CLOVER_LEAF_PATH}
          fillOpacity={distinguishLucky && i === CLOVER_LUCKY_LEAF ? 0.55 : undefined}
          transform={cloverLeafTransform(angle, 1.38)}
        />
      ))}
    </svg>
  );
}

/**
 * `tone="inherit"` lets the mark take the lockup's own colour instead of the brand green.
 *
 * On a dark surface the green mark is nearly invisible next to a light wordmark — the sign-in
 * panel's whole lockup wants to be cream. The default stays the green mark beside dark text,
 * because that is the lockup everywhere else.
 */
export function CloverWordmark({ className, size = 22, tone = "accent" }: { className?: string; size?: number; tone?: "accent" | "inherit" }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-primary", className)}>
      <CloverMark size={size} className={tone === "accent" ? "text-accent" : undefined} />
      <span className="display font-semibold" style={{ fontSize: size * 0.95, letterSpacing: "-0.035em", lineHeight: 1 }}>
        clover
      </span>
    </span>
  );
}
