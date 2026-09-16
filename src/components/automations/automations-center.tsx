"use client";
import { useCallback, useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import type { AutomationType } from "@/lib/db";
import type { AutomationDefinition, ResolvedRule } from "@/lib/automations";
import type { AutomationActivity, RecommendationDTO } from "@/lib/automations/recommendations";
import { DemoBadge } from "@/components/ui/badge";
import { Page, PageHeader } from "@/components/layout/page-header";
import { errorMessage } from "@/lib/client/request";
import { AutomationCard } from "./automation-card";
import { automationsApi, type LastRun } from "./automations-api";
import { RecommendationRow } from "./recommendation-row";
import { RunNow } from "./run-now";

export type AutomationsCenterProps = {
  registry: AutomationDefinition[];
  rules: ResolvedRule[];
  activity: Record<AutomationType, AutomationActivity[]>;
  recommendations: RecommendationDTO[];
  lastRun: LastRun;
  demo: boolean;
};

export function AutomationsCenter(props: AutomationsCenterProps) {
  const [rules, setRules] = useState(props.rules);
  const [activity, setActivity] = useState(props.activity);
  const [recs, setRecs] = useState(props.recommendations);
  const [lastRun, setLastRun] = useState(props.lastRun);

  const modes = useMemo(() => new Map(rules.map((r) => [r.type, r.mode])), [rules]);
  const open = recs.filter((r) => r.status === "OPEN");
  const approvals = open.filter((r) => modes.get(r.type) === "ASK" && r.applicable);
  const suggestions = open.filter((r) => !approvals.includes(r));
  const snoozed = recs.filter((r) => r.status === "SNOOZED");

  const refresh = useCallback(async () => {
    try {
      const [a, r] = await Promise.all([automationsApi.load(), automationsApi.recommendations()]);
      setRules(a.rules);
      setActivity(a.activity);
      setLastRun(a.lastRun);
      setRecs(r.recommendations);
    } catch (err) {
      toast.error(errorMessage(err, "Could not refresh."));
    }
  }, []);

  const onRuleChange = (rule: ResolvedRule) => setRules((rs) => rs.map((r) => (r.type === rule.type ? rule : r)));
  const onRecChange = (next: RecommendationDTO) => {
    setRecs((rs) => rs.map((r) => (r.id === next.id ? next : r)));
    setActivity((a) => ({ ...a, [next.type]: a[next.type].map((x) => (x.id === next.id ? { ...x, status: next.status, resolvedAt: next.resolvedAt } : x)) }));
  };

  return (
    <Page>
      <PageHeader
        eyebrow="Automations"
        title="Let Clover keep watch."
        description="Nine checks that run over your inventory. Each one can stay quiet, suggest, ask first, or — where it is safe — act on its own."
        actions={
          <div className="flex flex-col items-end gap-2">
            {props.demo && <DemoBadge />}
            <RunNow lastRun={lastRun} onFinished={refresh} />
          </div>
        }
      />

      <p className="mb-6 flex items-center gap-2 text-sm text-secondary">
        <ShieldCheck className="size-4 shrink-0 text-accent" aria-hidden />
        Clover never makes irreversible changes without you.
      </p>

      <section className="surface-card mb-6 p-5" aria-labelledby="approvals-heading">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="approvals-heading" className="text-base font-semibold text-primary">
            Pending approvals
          </h2>
          <span className="tabular text-sm text-muted">{approvals.length}</span>
        </div>
        {approvals.length === 0 ? (
          <p className="mt-2 text-sm text-secondary">Nothing is waiting for your approval. Automations set to “Ask before changing” will list their proposals here.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border-subtle">
            {approvals.map((r) => (
              <RecommendationRow key={r.id} rec={r} onChange={onRecChange} />
            ))}
          </ul>
        )}
      </section>

      {suggestions.length > 0 && (
        <section className="surface-card mb-6 p-5" aria-labelledby="suggestions-heading">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="suggestions-heading" className="text-base font-semibold text-primary">
              Suggestions
            </h2>
            <span className="tabular text-sm text-muted">{suggestions.length}</span>
          </div>
          <ul className="mt-3 divide-y divide-border-subtle">
            {suggestions.map((r) => (
              <RecommendationRow key={r.id} rec={r} approveLabel="Apply" onChange={onRecChange} />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="rules-heading">
        <h2 id="rules-heading" className="sr-only">
          Automation rules
        </h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {props.registry.map((def) => {
            const rule = rules.find((r) => r.type === def.type);
            if (!rule) return null;
            return <AutomationCard key={def.type} def={def} rule={rule} activity={activity[def.type] ?? []} onRuleChange={onRuleChange} />;
          })}
        </div>
      </section>

      {snoozed.length > 0 && (
        <section className="mt-6 surface-card p-5" aria-labelledby="snoozed-heading">
          <h2 id="snoozed-heading" className="text-base font-semibold text-primary">
            Snoozed
          </h2>
          <ul className="mt-3 divide-y divide-border-subtle">
            {snoozed.map((r) => (
              <RecommendationRow key={r.id} rec={r} approveLabel="Apply" onChange={onRecChange} />
            ))}
          </ul>
        </section>
      )}
    </Page>
  );
}
