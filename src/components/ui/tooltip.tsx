"use client";
import * as T from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils/cn";

export function Tooltip({ content, children, side = "top", className }: { content: React.ReactNode; children: React.ReactElement; side?: "top" | "bottom" | "left" | "right"; className?: string }) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content side={side} sideOffset={6} className={cn("z-50 max-w-xs rounded-xs bg-surface-inverse px-2.5 py-1.5 text-xs text-inverse shadow-float animate-fade-in", className)}>
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
