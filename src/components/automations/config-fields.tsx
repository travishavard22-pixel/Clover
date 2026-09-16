"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { AutomationDefinition, ConfigField } from "@/lib/automations/types";
import { cn } from "@/lib/utils/cn";

type ConfigValue = Record<string, number | boolean>;

function fieldLabel(f: ConfigField, v: number | boolean) {
  if (f.kind === "boolean") return null;
  if (f.unit === "cents") return `$${((v as number) / 100).toFixed(2)}`;
  return `${v}${f.unit ? ` ${f.unit}` : ""}`;
}

/** The Configure disclosure: one control per parameter, saved as a whole with an explicit button. */
export function ConfigFields({ def, value, onSave, saving }: { def: AutomationDefinition; value: ConfigValue; onSave: (next: ConfigValue) => Promise<void>; saving: boolean }) {
  const [draft, setDraft] = useState<ConfigValue>(value);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setDraft(value), [value]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(value);

  const set = (key: string, v: number | boolean) => setDraft((d) => ({ ...d, [key]: v }));

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        for (const f of def.fields) {
          if (f.kind !== "number") continue;
          const v = draft[f.key];
          if (typeof v !== "number" || !Number.isFinite(v) || v < f.min || v > f.max) {
            setError(`${f.label} must be between ${f.min} and ${f.max}${f.unit ? ` ${f.unit}` : ""}.`);
            return;
          }
        }
        try {
          await onSave(draft);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not save.");
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {def.fields.map((f) => {
          const id = `${def.type}-${f.key}`;
          const v = draft[f.key];
          if (f.kind === "boolean") {
            return (
              <div key={f.key} className="flex items-start justify-between gap-4 rounded-xs border border-border-subtle px-3 py-2.5 sm:col-span-2">
                <div className="min-w-0">
                  <label htmlFor={id} className="text-sm font-medium text-primary">
                    {f.label}
                  </label>
                  {f.help && <p className="mt-0.5 text-xs text-secondary">{f.help}</p>}
                </div>
                <Switch id={id} checked={v === true} onCheckedChange={(c) => set(f.key, c)} aria-describedby={f.help ? `${id}-help` : undefined} />
              </div>
            );
          }
          const step = f.step ?? 1;
          return (
            <div key={f.key} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor={id} className="text-sm font-medium text-primary">
                  {f.label}
                </label>
                <span className="tabular text-xs text-secondary">{fieldLabel(f, typeof v === "number" ? v : f.min)}</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  aria-label={`${f.label} slider`}
                  min={f.min}
                  max={f.max}
                  step={step}
                  value={typeof v === "number" ? v : f.min}
                  onChange={(e) => set(f.key, Number(e.target.value))}
                  className="h-2 flex-1 cursor-pointer accent-(--accent)"
                />
                <Input
                  id={id}
                  type="number"
                  inputMode="numeric"
                  min={f.min}
                  max={f.max}
                  step={step}
                  value={typeof v === "number" ? v : ""}
                  onChange={(e) => set(f.key, e.target.value === "" ? f.min : Number(e.target.value))}
                  className={cn("w-24 tabular", "h-9")}
                  aria-describedby={f.help ? `${id}-help` : undefined}
                />
              </div>
              {f.help && (
                <p id={`${id}-help`} className="text-xs text-secondary">
                  {f.help}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={!dirty} loading={saving}>
          Save settings
        </Button>
        {dirty && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(value)}>
            Reset
          </Button>
        )}
        {!dirty && <span className="text-xs text-muted">Saved</span>}
      </div>
    </form>
  );
}
