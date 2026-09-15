"use client";
import { forwardRef, useId } from "react";
import { cn } from "@/lib/utils/cn";

const fieldBase =
  "w-full rounded-xs border border-border-default bg-surface-raised px-3 text-base text-primary placeholder:text-muted transition-colors duration-(--dur-fast) focus-visible:border-accent disabled:opacity-60 aria-invalid:border-danger";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(fieldBase, "h-10", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(fieldBase, "min-h-24 py-2 leading-relaxed", className)} {...props} />;
});

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("block text-sm font-medium text-primary", className)} {...props} />;
}

export function Field({
  label,
  hint,
  error,
  children,
  id,
  className,
  optional,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => React.ReactNode;
  id?: string;
  className?: string;
  optional?: boolean;
}) {
  const auto = useId();
  const fid = id ?? auto;
  const hintId = hint ? `${fid}-hint` : undefined;
  const errId = error ? `${fid}-err` : undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={fid}>
        {label}
        {optional && <span className="ml-1 font-normal text-muted">(optional)</span>}
      </Label>
      {children({ id: fid, "aria-describedby": [hintId, errId].filter(Boolean).join(" ") || undefined, "aria-invalid": !!error })}
      {hint && !error && (
        <p id={hintId} className="text-sm text-secondary">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Money input: displays dollars, emits cents. */
export const MoneyInput = forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & { valueCents: number | null; onChangeCents: (cents: number | null) => void }
>(function MoneyInput({ valueCents, onChangeCents, className, ...props }, ref) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
      <input
        ref={ref}
        inputMode="decimal"
        className={cn(fieldBase, "h-10 pl-7 tabular", className)}
        value={valueCents === null || valueCents === undefined ? "" : (valueCents / 100).toFixed(2).replace(/\.00$/, "")}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9.]/g, "");
          if (raw === "") return onChangeCents(null);
          const n = Number(raw);
          onChangeCents(Number.isFinite(n) ? Math.round(n * 100) : null);
        }}
        {...props}
      />
    </div>
  );
});
