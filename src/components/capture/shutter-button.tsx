"use client";
import { forwardRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils/cn";

/** The capture shutter. Settle spring on press (stiffness 380, damping 34). Keyboard presses do not animate. */
export const ShutterButton = forwardRef<HTMLButtonElement, { onCapture: (viaKeyboard: boolean) => void; disabled?: boolean; busy?: boolean; className?: string; label?: string }>(
  function ShutterButton({ onCapture, disabled, busy, className, label = "Take photo" }, ref) {
    const reduce = useReducedMotion();
    return (
      <motion.button
        ref={ref}
        type="button"
        aria-label={label}
        aria-keyshortcuts="Space Enter"
        disabled={disabled}
        onClick={(e) => onCapture(e.detail === 0)}
        whileTap={reduce || disabled ? undefined : { scale: 0.92 }}
        transition={{ type: "spring", stiffness: 380, damping: 34 }}
        className={cn(
          "relative flex size-[76px] items-center justify-center rounded-full border-[3px] border-surface-inverse/90 bg-transparent shadow-lift transition-opacity disabled:opacity-40",
          className,
        )}
      >
        <span className={cn("block size-[62px] rounded-full bg-surface-inverse transition-transform duration-(--dur-fast) ease-(--ease-out)", busy && "scale-90")} aria-hidden />
      </motion.button>
    );
  },
);
