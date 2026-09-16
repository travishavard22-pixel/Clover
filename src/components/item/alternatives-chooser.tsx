"use client";
import { useState } from "react";
import { Check } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { ItemProfile } from "@/lib/ai/schemas";
import { cn } from "@/lib/utils/cn";

/**
 * "Is it one of these?" — the AI's competing identifications side by side. One tap confirms. The
 * current identification is shown first so the seller can also confirm it as-is.
 */
export function AlternativesChooser({ profile, onPick, onConfirmCurrent }: { profile: ItemProfile; onPick: (index: number) => Promise<void>; onConfirmCurrent: () => Promise<void> }) {
  const [busy, setBusy] = useState<number | "current" | null>(null);
  const reduce = useReducedMotion();
  const options = [
    { key: "current" as const, itemName: profile.itemName.value, brand: profile.brand?.value ?? null, model: profile.model?.value ?? null, likelihood: profile.identityConfidence, current: true },
    ...profile.alternativeIdentifications.map((a, i) => ({ key: i, itemName: a.itemName, brand: a.brand, model: a.model, likelihood: a.likelihood, current: false })),
  ];

  const pick = async (key: number | "current") => {
    setBusy(key);
    try {
      if (key === "current") await onConfirmCurrent();
      else await onPick(key);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby="alt-heading" className="rounded-md border border-warning/40 bg-warning-soft/40 p-4">
      <h4 id="alt-heading" className="text-sm font-semibold text-primary">
        Is it one of these?
      </h4>
      <p className="mt-0.5 text-xs text-secondary">The identification is not certain. Pick the right one and the price and listing update to match.</p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" role="list">
        {options.map((o, i) => (
          <motion.li key={String(o.key)} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, delay: i * 0.04, ease: [0.23, 1, 0.32, 1] }} className="list-none">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void pick(o.key)}
              aria-busy={busy === o.key}
              className={cn("flex h-full w-full flex-col items-start gap-1 rounded-sm border bg-surface-raised p-3 text-left transition-colors hover:border-accent focus-visible:border-accent disabled:opacity-60", o.current ? "border-border-default" : "border-border-subtle")}
            >
              <span className="text-sm font-medium text-primary">{o.itemName}</span>
              <span className="text-xs text-secondary">{[o.brand, o.model].filter(Boolean).join(" · ") || "Brand and model not read"}</span>
              <span className="mt-auto flex items-center gap-1.5 pt-1 text-xs text-muted">
                <Check className="size-3.5" aria-hidden />
                {o.current ? "Confirm this" : "Use this"}
                <span className="tabular" aria-label={`likelihood ${Math.round(o.likelihood * 100)} percent`}>
                  · {Math.round(o.likelihood * 100)}%
                </span>
              </span>
            </button>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}
