import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/** The persistent honesty note. Present on every studio screen, in every state. */
export function StudioNote({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-start gap-2 text-xs leading-relaxed text-secondary", className)}>
      <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-accent-text" aria-hidden />
      <span>Clover never alters the item itself: pixels of the product are preserved; only background, shadow and framing change. AI-generated backgrounds are labelled.</span>
    </p>
  );
}
