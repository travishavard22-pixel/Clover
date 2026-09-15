"use client";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "./button";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  title,
  description,
  children,
  className,
  size = "md",
  hideTitle,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  hideTitle?: boolean;
}) {
  const sizes = { sm: "sm:max-w-sm", md: "sm:max-w-lg", lg: "sm:max-w-2xl", xl: "sm:max-w-4xl", full: "sm:max-w-[min(96vw,1400px)]" };
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-scrim animate-fade-in" />
      <D.Content
        className={cn(
          "fixed z-50 flex flex-col bg-surface-overlay text-primary shadow-lift focus:outline-none",
          "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-lg border-t border-border-default",
          "sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[86dvh] sm:w-full sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:border",
          "animate-fade-up",
          sizes[size],
          className,
        )}
      >
        <div className={cn("flex items-start justify-between gap-4 px-5 pt-5", hideTitle && "sr-only")}>
          <div>
            <D.Title className="text-lg font-semibold">{title}</D.Title>
            {description && <D.Description className="mt-1 text-sm text-secondary">{description}</D.Description>}
          </div>
          <D.Close asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Close">
              <X className="size-4" />
            </Button>
          </D.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4 safe-bottom">{children}</div>
      </D.Content>
    </D.Portal>
  );
}
