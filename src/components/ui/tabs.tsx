"use client";
import * as T from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils/cn";

export const Tabs = T.Root;
export const TabsContent = T.Content;

export function TabsList({ className, ...props }: T.TabsListProps) {
  return <T.List className={cn("hide-scrollbar inline-flex h-10 items-center gap-1 overflow-x-auto rounded-sm bg-surface-sunken p-1", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: T.TabsTriggerProps) {
  return (
    <T.Trigger
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-xs px-3 text-sm font-medium text-secondary transition-colors data-[state=active]:bg-surface-raised data-[state=active]:text-primary data-[state=active]:shadow-[0_1px_2px_oklch(0_0_0/0.06)]",
        className,
      )}
      {...props}
    />
  );
}

/** Underline-style tabs for page sections. */
export function TabsUnderline({ className, ...props }: T.TabsListProps) {
  return <T.List className={cn("hide-scrollbar flex gap-6 overflow-x-auto border-b border-border-subtle", className)} {...props} />;
}
export function TabUnderlineTrigger({ className, ...props }: T.TabsTriggerProps) {
  return (
    <T.Trigger
      className={cn(
        "-mb-px shrink-0 border-b-2 border-transparent pb-3 text-sm font-medium text-secondary transition-colors hover:text-primary data-[state=active]:border-accent data-[state=active]:text-primary",
        className,
      )}
      {...props}
    />
  );
}
