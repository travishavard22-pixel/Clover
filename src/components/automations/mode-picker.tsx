"use client";
import type { AutomationMode } from "@/lib/db";
import { AUTOMATION_MODES, MODE_LABELS, type AutomationDefinition } from "@/lib/automations/types";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils/cn";

/**
 * Off / Suggestions only / Ask before changing / Automatic. Unsupported modes stay visible but
 * disabled, with the reason in a tooltip and repeated as text below for touch and screen readers.
 */
export function ModePicker({ def, value, onChange, disabled, id }: { def: AutomationDefinition; value: AutomationMode; onChange: (m: AutomationMode) => void; disabled?: boolean; id?: string }) {
  const unsupported = AUTOMATION_MODES.filter((m) => !def.supportedModes.includes(m));
  return (
    <div className="space-y-2">
      <div id={id} role="radiogroup" aria-label={`${def.name} mode`} className="grid grid-cols-2 gap-1 rounded-sm bg-surface-sunken p-1">
        {AUTOMATION_MODES.map((m) => {
          const supported = def.supportedModes.includes(m);
          const reason = def.unsupportedReason?.[m];
          const button = (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={value === m}
              aria-disabled={!supported || disabled || undefined}
              disabled={disabled}
              onClick={() => supported && !disabled && onChange(m)}
              className={cn(
                "flex min-h-9 items-center justify-center rounded-xs px-2 py-1 text-center text-sm leading-tight font-medium transition-colors",
                value === m ? "bg-surface-raised text-primary shadow-[0_1px_2px_oklch(0_0_0/0.06)]" : "text-secondary",
                !supported && "cursor-not-allowed text-muted line-through decoration-border-strong",
              )}
            >
              {MODE_LABELS[m]}
            </button>
          );
          return supported || !reason ? (
            button
          ) : (
            <Tooltip key={m} content={reason}>
              {button}
            </Tooltip>
          );
        })}
      </div>
      {def.modeHelp[value] && <p className="text-sm text-secondary">{def.modeHelp[value]}</p>}
      {value === "AUTO" && def.autoWarning && (
        <p className="rounded-xs bg-warning-soft px-2.5 py-1.5 text-sm text-warning" role="note">
          {def.autoWarning}
        </p>
      )}
      {unsupported.length > 0 && (
        <p className="text-xs text-muted">
          {unsupported.map((m) => `${MODE_LABELS[m]}: ${def.unsupportedReason?.[m] ?? "not available for this automation."}`).join(" ")}
        </p>
      )}
    </div>
  );
}
