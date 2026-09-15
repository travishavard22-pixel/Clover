"use client";
import { Toaster } from "sonner";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { MotionConfig } from "motion/react";
import { ThemeProvider } from "./theme";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <MotionConfig reducedMotion="user" transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}>
        <TooltipProvider delayDuration={300}>
          {children}
          <Toaster position="bottom-center" richColors={false} closeButton toastOptions={{ className: "surface-sheet !text-primary" }} />
        </TooltipProvider>
      </MotionConfig>
    </ThemeProvider>
  );
}
