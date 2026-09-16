"use client";
import * as S from "@radix-ui/react-switch";
import * as C from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function Switch({ className, ...props }: S.SwitchProps) {
  return (
    <S.Root
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-transparent bg-border-strong transition-colors data-[state=checked]:bg-accent disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <S.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow-[0_1px_2px_oklch(0_0_0/0.3)] transition-transform duration-(--dur-fast) ease-(--ease-out) data-[state=checked]:translate-x-[18px]" />
    </S.Root>
  );
}

export function Checkbox({ className, ...props }: C.CheckboxProps) {
  return (
    <C.Root
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-[5px] border border-border-strong bg-surface-raised transition-colors data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=checked]:text-on-accent disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <C.Indicator>
        <Check className="size-3.5" strokeWidth={3} />
      </C.Indicator>
    </C.Root>
  );
}

export function SettingRow({ label, description, control, className }: { label: string; description?: string; control: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-6 py-3", className)}>
      <div className="min-w-0">
        <div className="text-sm font-medium text-primary">{label}</div>
        {description && <div className="mt-0.5 text-sm text-secondary">{description}</div>}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}
