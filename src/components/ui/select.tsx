"use client";
import * as S from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  className,
  id,
  disabled,
  "aria-label": ariaLabel,
}: {
  value: string | undefined;
  onValueChange: (v: string) => void;
  options: Array<{ value: string; label: string; description?: string }>;
  placeholder?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  return (
    <S.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <S.Trigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-xs border border-border-default bg-surface-raised px-3 text-base text-primary data-[placeholder]:text-muted disabled:opacity-60",
          className,
        )}
      >
        <S.Value placeholder={placeholder} />
        <S.Icon>
          <ChevronDown className="size-4 text-muted" />
        </S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content position="popper" sideOffset={6} className="z-50 max-h-72 min-w-(--radix-select-trigger-width) overflow-hidden rounded-sm border border-border-default bg-surface-floating shadow-float">
          <S.Viewport className="p-1">
            {options.map((o) => (
              <S.Item key={o.value} value={o.value} className="flex cursor-pointer select-none items-center gap-2 rounded-xs px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-surface-sunken">
                <span className="flex size-4 items-center justify-center">
                  <S.ItemIndicator>
                    <Check className="size-3.5" />
                  </S.ItemIndicator>
                </span>
                <div>
                  <S.ItemText>{o.label}</S.ItemText>
                  {o.description && <div className="text-xs text-muted">{o.description}</div>}
                </div>
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  );
}

/** Segmented control for 2–5 mutually exclusive options. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  "aria-label": ariaLabel,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: React.ReactNode }>;
  className?: string;
  "aria-label": string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("inline-flex items-center rounded-sm bg-surface-sunken p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-xs font-medium text-secondary transition-colors",
            size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-sm",
            value === o.value && "bg-surface-raised text-primary shadow-[0_1px_2px_oklch(0_0_0/0.06)]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
