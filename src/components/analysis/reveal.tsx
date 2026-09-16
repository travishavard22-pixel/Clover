"use client";
import { motion, useReducedMotion } from "motion/react";
import { AiBadge, Badge, DemoBadge } from "@/components/ui/badge";
import { AnimatedMoney } from "@/components/ui/money";
import type { RevealData } from "./derive";

/**
 * The one expressive moment: the item's name arrives in the editorial serif with the reveal
 * spring (stiffness 220, damping 26) and the recommended price counts up in tabular figures.
 * Reduced motion turns both into a crossfade and a snap. Estimates are labelled as estimates.
 */
export function Reveal({ data, demo, fallbackTitle }: { data: RevealData; demo: boolean; fallbackTitle: string }) {
  const reduce = useReducedMotion();
  const name = data.itemName ?? fallbackTitle;
  const spring = reduce ? { duration: 0.2 } : { type: "spring" as const, stiffness: 220, damping: 26 };
  return (
    <div className="flex flex-col items-start gap-3" role="status" aria-live="polite">
      <motion.h2 key={name} initial={{ opacity: 0, y: reduce ? 0 : 14 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="serif-display text-4xl text-primary sm:text-5xl">
        {data.itemName ? (
          <>
            It&apos;s a <span className="text-accent-text">{name}</span>.
          </>
        ) : (
          <>Ready for review.</>
        )}
      </motion.h2>
      {data.recommendedCents !== null && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: reduce ? 0 : 0.12, duration: 0.2 }} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <AnimatedMoney cents={data.recommendedCents} className="display text-3xl text-primary sm:text-4xl" duration={600} />
          <span className="text-sm text-secondary">recommended price</span>
          {data.basis === "MARKET_EVIDENCE" ? <Badge tone="success">{data.compsUsed ? `Based on ${data.compsUsed} sold comps` : "Market evidence"}</Badge> : <AiBadge />}
          {demo && <DemoBadge />}
        </motion.div>
      )}
      {data.recommendedCents === null && demo && <DemoBadge />}
    </div>
  );
}
