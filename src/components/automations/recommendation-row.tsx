"use client";
import { useState } from "react";
import Link from "next/link";
import { Check, Clock, X } from "lucide-react";
import { toast } from "sonner";
import type { RecommendationDTO } from "@/lib/automations/recommendations";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { errorMessage } from "@/lib/client/request";
import { TimeAgo } from "@/lib/client/time-ago";
import { automationsApi } from "./automations-api";

const SNOOZE_OPTIONS = [
  { days: 1, label: "Tomorrow" },
  { days: 3, label: "In 3 days" },
  { days: 7, label: "In a week" },
  { days: 30, label: "In a month" },
];

type Pending = "apply" | "dismiss" | "snooze" | null;

/**
 * One recommendation with Approve / Dismiss / Snooze. `approveLabel` is "Approve" in the pending
 * approvals list and "Apply" for plain suggestions. Informational recommendations only offer
 * "Got it" (dismiss) and snooze.
 */
export function RecommendationRow({ rec, approveLabel = "Approve", onChange }: { rec: RecommendationDTO; approveLabel?: string; onChange: (next: RecommendationDTO) => void }) {
  const [pending, setPending] = useState<Pending>(null);

  const run = async (kind: Exclude<Pending, null>, fn: () => Promise<RecommendationDTO>, success?: (r: RecommendationDTO) => string) => {
    setPending(kind);
    try {
      const next = await fn();
      onChange(next);
      if (success) toast.success(success(next));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPending(null);
    }
  };

  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">{rec.typeName}</Badge>
          {rec.status === "SNOOZED" && rec.snoozedUntil && (
            <span className="text-xs text-muted">Snoozed — back <TimeAgo iso={rec.snoozedUntil} mode="until" /></span>
          )}
        </div>
        <h4 className="mt-1.5 text-sm font-semibold text-primary">{rec.title}</h4>
        <p className="mt-0.5 text-sm text-secondary">{rec.body}</p>
        <p className="mt-1 text-xs text-muted">
          {rec.itemId ? (
            <>
              <Link href={`/items/${rec.itemId}`} className="text-accent-text underline-offset-4 hover:underline">
                {rec.itemTitle ?? "Open item"}
              </Link>
              {" · "}
            </>
          ) : null}
          <TimeAgo iso={rec.createdAt} />
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2" role="group" aria-label={`Actions for ${rec.title}`}>
        {rec.applicable ? (
          <Button size="sm" leadingIcon={<Check className="size-4" aria-hidden />} loading={pending === "apply"} disabled={pending !== null} onClick={() => run("apply", async () => (await automationsApi.apply(rec.id)).recommendation, () => "Applied.")}>
            {approveLabel}
          </Button>
        ) : null}
        <Menu>
          <MenuTrigger asChild>
            <Button size="sm" variant="outline" leadingIcon={<Clock className="size-4" aria-hidden />} loading={pending === "snooze"} disabled={pending !== null}>
              Snooze
            </Button>
          </MenuTrigger>
          <MenuContent>
            {SNOOZE_OPTIONS.map((o) => (
              <MenuItem key={o.days} onSelect={() => run("snooze", async () => (await automationsApi.snooze(rec.id, o.days)).recommendation, (r) => `Snoozed until ${r.snoozedUntil ? new Date(r.snoozedUntil).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "later"}.`)}>
                {o.label}
              </MenuItem>
            ))}
          </MenuContent>
        </Menu>
        <Button size="sm" variant="ghost" leadingIcon={<X className="size-4" aria-hidden />} loading={pending === "dismiss"} disabled={pending !== null} onClick={() => run("dismiss", async () => (await automationsApi.dismiss(rec.id)).recommendation)}>
          {rec.applicable ? "Dismiss" : "Got it"}
        </Button>
      </div>
    </li>
  );
}
