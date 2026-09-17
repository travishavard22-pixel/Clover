import { twMerge } from "tailwind-merge";

export type ClassValue = string | number | null | undefined | false | ClassValue[] | Record<string, boolean | null | undefined>;

/**
 * Combines class names and resolves Tailwind conflicts, so the last class of a group wins.
 *
 * This used to be plain concatenation, which quietly broke every conditional override: writing
 * `cn("text-[1.65rem]", long && "text-xl")` emitted both classes and left the stylesheet's order to
 * decide, so the intended override never applied. Merging makes `cn(base, override)` mean what it
 * reads as — which is how the `className` prop is used throughout the components.
 *
 * The project's own utilities (display, serif-display, surface-card, gutter, tabular, content-max,
 * hero-wash, skeleton, …) are unknown to tailwind-merge, so they are passed through untouched
 * rather than being folded into a group they do not belong to.
 */
export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];
  const walk = (v: ClassValue) => {
    if (!v) return;
    if (typeof v === "string" || typeof v === "number") out.push(String(v));
    else if (Array.isArray(v)) v.forEach(walk);
    else for (const [k, on] of Object.entries(v)) if (on) out.push(k);
  };
  inputs.forEach(walk);
  return twMerge(out.join(" "));
}
