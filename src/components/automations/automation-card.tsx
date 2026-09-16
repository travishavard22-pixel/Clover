"use client";
import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Settings2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import type { AutomationMode } from "@/lib/db";
import type { AutomationDefinition, ResolvedRule } from "@/lib/automations";
import type { AutomationActivity } from "@/lib/automations/recommendations";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { TimeAgo } from "@/lib/client/time-ago";
import { errorMessage } from "@/lib/client/request";
import { cn } from "@/lib/utils/cn";
import { automationsApi } from "./automations-api";
import { ConfigFields } from "./config-fields";
import { ModePicker } from "./mode-picker";

const STATUS_TONE: Record<AutomationActivity["status"], { tone: BadgeTone; label: string }> = {
  OPEN: { tone: "accent", label: "Open" },
  SNOOZED: { tone: "neutral", label: "Snoozed" },
  APPLIED: { tone: "success", label: "Applied" },
  DISMISSED: { tone: "neutral", label: "Dismissed" },
};

export function AutomationCard({ def, rule, activity, onRuleChange }: { def: AutomationDefinition; rule: ResolvedRule; activity: AutomationActivity[]; onRuleChange: (rule: ResolvedRule) => void }) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [savingMode, setSavingMode] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const isOff = rule.mode === "OFF";

  const setMode = async (mode: AutomationMode) => {
    if (mode === rule.mode) return;
    const previous = rule;
    onRuleChange({ ...rule, mode });
    setSavingMode(true);
    try {
      const { rules } = await automationsApi.updateRule(def.type, { mode });
      if (rules[0]) onRuleChange(rules[0]);
    } catch (err) {
      onRuleChange(previous);
      toast.error(errorMessage(err, `Could not change ${def.name}.`));
    } finally {
      setSavingMode(false);
    }
  };

  const saveConfig = async (config: Record<string, number | boolean>) => {
    setSavingConfig(true);
    try {
      const { rules } = await automationsApi.updateRule(def.type, { config });
      if (rules[0]) onRuleChange(rules[0]);
      toast.success(`${def.name} settings saved.`);
    } finally {
      setSavingConfig(false);
    }
  };

  return (
    <article className={cn("surface-card flex flex-col p-5 transition-opacity", isOff && "opacity-80")} aria-labelledby={`${def.type}-name`}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={`${def.type}-name`} className="text-base font-semibold text-primary">
            {def.name}
          </h3>
          <p className="mt-0.5 text-sm text-secondary">{def.description}</p>
        </div>
        {def.alwaysOn ? <Badge tone="neutral">Always on</Badge> : isOff ? <Badge tone="neutral">Off</Badge> : rule.mode === "AUTO" ? <Badge tone="accent">Automatic</Badge> : null}
      </header>

      <div className="mt-4">
        <ModePicker def={def} value={rule.mode} onChange={setMode} disabled={savingMode} id={`${def.type}-mode`} />
      </div>

      {def.fields.length > 0 && (
        <div className="mt-4 border-t border-border-subtle pt-3">
          <button type="button" className="flex w-full items-center justify-between gap-2 rounded-xs py-1 text-sm font-medium text-primary" aria-expanded={open} aria-controls={`${def.type}-config`} onClick={() => setOpen((o) => !o)}>
            <span className="flex items-center gap-2">
              <Settings2 className="size-4 text-muted" aria-hidden />
              Configure
            </span>
            <ChevronDown className={cn("size-4 text-muted transition-transform duration-(--dur-base)", open && "rotate-180")} aria-hidden />
          </button>
          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                id={`${def.type}-config`}
                key="config"
                initial={{ opacity: 0, y: reduce ? 0 : -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: reduce ? 0 : -6 }}
                transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                className="pt-3"
              >
                <ConfigFields def={def} value={rule.config as Record<string, number | boolean>} onSave={saveConfig} saving={savingConfig} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <div className="mt-4 border-t border-border-subtle pt-3">
        <h4 className="text-xs font-medium uppercase tracking-wide text-muted">Recent activity</h4>
        {activity.length === 0 ? (
          <p className="mt-1.5 text-sm text-muted">{isOff ? "Switched off — nothing to report." : "Nothing yet. Run the automations to check your inventory."}</p>
        ) : (
          <ul className="mt-1.5 space-y-1.5">
            {activity.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-3 text-sm">
                <span className="min-w-0">
                  {a.itemId ? (
                    <Link href={`/items/${a.itemId}`} className="line-clamp-1 text-primary underline-offset-4 hover:underline">
                      {a.title}
                    </Link>
                  ) : (
                    <span className="line-clamp-1 text-primary">{a.title}</span>
                  )}
                  <TimeAgo iso={a.createdAt} className="block text-xs text-muted" />
                </span>
                <Badge tone={STATUS_TONE[a.status].tone} className="shrink-0">
                  {STATUS_TONE[a.status].label}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}
