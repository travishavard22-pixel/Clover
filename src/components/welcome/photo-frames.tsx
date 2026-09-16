"use client";
import { motion, useReducedMotion } from "motion/react";

/**
 * Abstract "photo frames" built with CSS: three tiles that settle into place, standing in for the
 * capture → studio → listing progression without stock photography.
 */
export function PhotoFrames() {
  const reduce = useReducedMotion();
  const tiles = [
    { label: "Original", bg: "linear-gradient(160deg, oklch(0.62 0.05 60), oklch(0.42 0.05 40))", rotate: -6, x: 0, y: 24 },
    { label: "Clean studio", bg: "linear-gradient(160deg, oklch(0.975 0.005 90), oklch(0.9 0.008 90))", rotate: 3, x: 40, y: -10 },
    { label: "Listed · $185", bg: "linear-gradient(160deg, oklch(0.32 0.08 152), oklch(0.2 0.03 152))", rotate: -2, x: 90, y: 40 },
  ];
  return (
    <div className="relative mx-auto h-[360px] w-full max-w-[460px] md:h-[440px]" aria-hidden>
      {tiles.map((t, i) => (
        <motion.div
          key={t.label}
          initial={reduce ? false : { opacity: 0, y: 30, rotate: 0 }}
          animate={{ opacity: 1, y: t.y, x: t.x, rotate: t.rotate }}
          transition={{ delay: 0.15 + i * 0.12, type: "spring", stiffness: 220, damping: 26 }}
          className="absolute left-0 top-0 w-[68%] overflow-hidden rounded-lg border border-border-subtle shadow-lift"
          style={{ aspectRatio: "4 / 5", background: t.bg }}
        >
          <div className="absolute left-1/2 top-1/2 h-[46%] w-[58%] -translate-x-1/2 -translate-y-1/2 rounded-[14%] bg-[oklch(0.5_0.12_152)] opacity-90 shadow-[0_18px_40px_-18px_oklch(0_0_0/0.6)]" />
          <div className="absolute left-1/2 top-[38%] h-[6%] w-[36%] -translate-x-1/2 rounded-full bg-white/25" />
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between px-4 py-3 text-xs font-medium text-white scrim-text" style={{ background: "linear-gradient(to top, oklch(0 0 0 / 0.45), transparent)" }}>
            <span>{t.label}</span>
            {i === 1 && <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px]">AI background</span>}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
