import { cn } from "@/lib/utils/cn";

/** Server-safe button class recipes (no "use client"), usable on <Link> in server components. */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "danger" | "link";
export type ButtonSize = "sm" | "md" | "lg" | "icon" | "icon-sm";

export const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium select-none transition-[background-color,color,border-color,transform,opacity] duration-(--dur-fast) ease-(--ease-out) disabled:opacity-50 disabled:pointer-events-none active:scale-[0.985] rounded-xs";

export const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-active",
  secondary: "bg-surface-sunken text-primary hover:bg-border-subtle",
  outline: "border border-border-default bg-surface-raised text-primary hover:bg-surface-sunken",
  ghost: "text-primary hover:bg-surface-sunken",
  danger: "bg-danger text-white hover:opacity-90",
  link: "text-accent-text underline-offset-4 hover:underline px-0 h-auto",
};

export const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-5 text-base rounded-sm",
  icon: "h-10 w-10 touch-target",
  "icon-sm": "h-8 w-8",
};

export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}
