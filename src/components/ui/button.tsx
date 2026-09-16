"use client";
import { cloneElement, forwardRef, isValidElement } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { base, sizes, variants, type ButtonSize, type ButtonVariant } from "./button-classes";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  /** Render the styles onto the single child element (e.g. a <Link>) instead of a <button>. */
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", loading, leadingIcon, trailingIcon, children, disabled, type = "button", asChild, ...props },
  ref,
) {
  if (asChild && isValidElement(children)) {
    const child = children as React.ReactElement<{ className?: string; children?: React.ReactNode }>;
    return cloneElement(child, {
      ...(props as object),
      className: cn(base, variants[variant], sizes[size], className, child.props.className),
      children: (
        <>
          {leadingIcon}
          {child.props.children}
          {trailingIcon}
        </>
      ),
    });
  }
  return (
    <button ref={ref} type={type} className={cn(base, variants[variant], sizes[size], className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : leadingIcon}
      {children}
      {!loading && trailingIcon}
    </button>
  );
});
