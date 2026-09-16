"use client";
import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils/cn";

export function Money({ cents, currency = "USD", className, compact }: { cents: number | null | undefined; currency?: string; className?: string; compact?: boolean }) {
  return <span className={cn("tabular", className)}>{formatMoney(cents, currency, { compact })}</span>;
}

/** Counts up to the target once (the "price reveal"). Honors reduced motion by snapping. */
export function AnimatedMoney({ cents, currency = "USD", className, duration = 600 }: { cents: number; currency?: string; className?: string; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) {
      setDisplay(cents);
      return;
    }
    started.current = true;
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setDisplay(cents);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(cents * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cents, duration]);
  return (
    <span className={cn("tabular", className)} aria-label={formatMoney(cents, currency)}>
      {formatMoney(display, currency)}
    </span>
  );
}
